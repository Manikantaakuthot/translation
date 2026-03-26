/**
 * TranslationService — BlackBox-style voice agent architecture.
 *
 * Uses ElevenLabs Conversational AI SDK with WebRTC for:
 * - Built-in echo cancellation (AEC) — no manual echo prevention needed
 * - Built-in noise suppression
 * - Sub-100ms latency STT via Scribe
 * - Automatic turn-taking and VAD
 *
 * Architecture:
 *   Mic → ElevenLabs Agent (WebRTC+AEC) → Custom LLM (our server translates) → Socket.IO → Other User
 *
 * The agent captures mic audio via WebRTC, transcribes it, and sends to our
 * Custom LLM endpoint which translates and forwards to the other user.
 * The agent's own audio response is muted (volume 0) since we don't want
 * the speaker hearing their own translation.
 *
 * TTS playback for received translations still uses AudioContext/HTMLAudio/SpeechSynthesis.
 */

import { Conversation } from '@elevenlabs/client';
import { Socket } from 'socket.io-client';
import { translationApi } from '../api/client';

// API URL helper (same logic as api/client.ts)
function getApiBaseUrl() {
  if ((import.meta as any).env?.VITE_API_URL) return (import.meta as any).env.VITE_API_URL;
  if ((import.meta as any).env?.DEV) return '/api';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api';
  return `http://${host}:3000/api`;
}

export interface TranslationCallbacks {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAgentMessage?: (message: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

export class TranslationService {
  private conversation: any = null; // Conversation instance from @elevenlabs/client
  private isActive = false;
  private lastSpeakerChunkLogAt = 0;
  private lastListenerChunkLogAt = 0;

  // Browser SpeechRecognition instance
  private browserRecognition: any = null;

  // Whether browser STT is the active/primary STT mode (vs server-side Whisper)
  private browserSttActive = false;

  // Speaker's language for STT (set explicitly for better recognition)
  private speakerLanguage: string = 'en-US';

  // Socket reference for echo prevention (pause/resume STT during TTS playback)
  private activeSocket: any = null;
  private activeCallId: string | null = null;

  // Playback state (for received translations — TTS audio from server)
  private currentAudio: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private playbackContext: AudioContext | null = null;
  private playbackSource: AudioBufferSourceNode | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  // Audio queue — sequential playback instead of dropping
  private audioQueue: Array<{ base64: string; text: string; language: string; onEnd?: () => void }> = [];
  private isPlayingQueue = false;

  // Prevent TTS backlog from growing (keeps translation feeling real-time)
  private readonly MAX_AUDIO_QUEUE_SIZE = 2;

  private logStage(stage: string, callId: string, details?: Record<string, any>) {
    const payload = details
      ? Object.entries(details)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(' ')
      : '';
    console.log(`[voice_stage_client] ${stage} callId=${callId}${payload ? ` ${payload}` : ''}`);
  }

  /** Get or create a shared AudioContext for playback — awaits resume if suspended */
  private async getPlaybackContext(): Promise<AudioContext> {
    if (!this.playbackContext || this.playbackContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioCtx();
      console.log('[TTS] Created new AudioContext, state:', this.playbackContext.state);
    }
    if (this.playbackContext.state === 'suspended') {
      console.log('[TTS] Resuming suspended AudioContext...');
      await this.playbackContext.resume();
      console.log('[TTS] AudioContext resumed, state:', this.playbackContext.state);
    }
    return this.playbackContext;
  }

  /** Play audio via AudioContext.decodeAudioData — most reliable method during WebRTC calls */
  private async playViaAudioContext(audioData: ArrayBuffer, onEnd?: () => void): Promise<boolean> {
    try {
      const ctx = await this.getPlaybackContext();
      const audioBuffer = await ctx.decodeAudioData(audioData.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      if (this.playbackSource) {
        try { this.playbackSource.stop(); } catch {}
      }
      this.playbackSource = source;

      source.onended = () => {
        console.log('[TTS] AudioContext playback finished');
        this.playbackSource = null;
        onEnd?.();
      };

      source.start(0);
      console.log(`[TTS] Playing via AudioContext (duration: ${audioBuffer.duration.toFixed(1)}s, channels: ${audioBuffer.numberOfChannels}, sampleRate: ${audioBuffer.sampleRate}, ctxState: ${ctx.state})`);
      return true;
    } catch (err) {
      console.warn('[TTS] AudioContext playback failed:', err);
      return false;
    }
  }

  /** Play audio via HTMLAudioElement — fallback method */
  private async playViaAudioElement(blob: Blob, onEnd?: () => void): Promise<boolean> {
    try {
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      audio.volume = 1.0;
      audio.setAttribute('playsinline', 'true');
      // Add to DOM for better browser compatibility (some mobile browsers require it)
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this.currentAudio = audio;
      this.currentBlobUrl = blobUrl;

      return new Promise<boolean>((resolve) => {
        audio.onended = () => {
          console.log('[TTS] HTMLAudio playback finished');
          this.cleanupAudio();
          onEnd?.();
          resolve(true);
        };

        audio.onerror = (e) => {
          console.warn('[TTS] HTMLAudio playback error, readyState:', audio.readyState, 'error:', audio.error?.message || e);
          this.cleanupAudio();
          resolve(false);
        };

        audio.play().then(() => {
          console.log('[TTS] Playing via HTMLAudioElement, duration:', audio.duration);
        }).catch((err) => {
          console.warn('[TTS] HTMLAudio play() rejected:', err.message);
          this.cleanupAudio();
          resolve(false);
        });
      });
    } catch (err) {
      console.warn('[TTS] HTMLAudio setup failed:', err);
      return false;
    }
  }

  /** Language code mapping for SpeechSynthesis */
  private getSpeechSynthesisLang(lang: string): string {
    const map: Record<string, string> = {
      en: 'en-US', te: 'te-IN', hi: 'hi-IN', ta: 'ta-IN',
      kn: 'kn-IN', ml: 'ml-IN', es: 'es-ES', fr: 'fr-FR',
      de: 'de-DE', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
      ar: 'ar-SA', ru: 'ru-RU', it: 'it-IT', pt: 'pt-BR',
      bn: 'bn-IN', tr: 'tr-TR', vi: 'vi-VN', th: 'th-TH',
    };
    return map[lang] || lang;
  }

  /** Speak text using browser's built-in SpeechSynthesis */
  private speakWithSpeechSynthesis(text: string, language: string, onEnd?: () => void): boolean {
    if (!window.speechSynthesis) return false;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.getSpeechSynthesisLang(language);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      this.currentUtterance = utterance;

      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find((v) => v.lang.startsWith(language));
      if (matchingVoice) utterance.voice = matchingVoice;

      utterance.onend = () => {
        this.currentUtterance = null;
        onEnd?.();
      };
      utterance.onerror = () => {
        this.currentUtterance = null;
        onEnd?.();
      };

      window.speechSynthesis.speak(utterance);
      console.log('[TTS] Playing via SpeechSynthesis in', utterance.lang);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start speech recognition for real-time translation during calls.
   *
   * Priority:
   * 1. Browser SpeechRecognition API (free, no API key, works in Chrome/Edge/Safari)
   *    → emits `call:speech` socket event → server translates + TTS → other user
   * 2. ElevenLabs Agent (requires public webhook URL — won't work on localhost)
   * 3. Legacy PCM recording (requires ElevenLabs STT WebSocket)
   */
  async startRecording(
    socket: Socket,
    callId: string,
    language: string,
    onError?: (error: string) => void,
    existingStream?: MediaStream,
    /** Other user's ID — needed for agent-based translation */
    otherUserId?: string,
    /** Target language for translation */
    targetLanguage?: string,
    /**
     * Controls who receives the translated TTS.
     * - `speaker`: translate THIS user's audio and send TTS to the OTHER participant.
     * - `listener`: translate remote audio captured on THIS user's device and send TTS back to THIS user.
     */
    sttMode: 'speaker' | 'listener' = 'speaker',
  ): Promise<void> {
    if (this.isActive) {
      await this.stopRecording();
    }

    // Store socket/callId for echo prevention (pause/resume STT during TTS playback)
    this.activeSocket = socket;
    this.activeCallId = callId;

    // Map language codes to BCP-47 locale codes for better STT recognition
    const langToLocale: Record<string, string> = {
      en: 'en-US', te: 'te-IN', hi: 'hi-IN', ta: 'ta-IN', kn: 'kn-IN',
      ml: 'ml-IN', bn: 'bn-IN', gu: 'gu-IN', mr: 'mr-IN', pa: 'pa-IN',
      es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR',
      ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar-SA',
      tr: 'tr-TR', vi: 'vi-VN', th: 'th-TH',
    };
    // The speaker speaks in `language` (or 'en' by default). Set for STT accuracy.
    // IMPORTANT: 'auto' is not a valid BCP-47 code — default to 'en-US' instead.
    this.speakerLanguage = langToLocale[language] || (language && language !== 'auto' ? language : 'en-US');
    console.log(`[Translation] Speaker language for STT: ${this.speakerLanguage}`);

    const resolvedTargetLanguage = targetLanguage || language || 'en';

    /**
     * STT STRATEGY (updated):
     * 1. PRIMARY: Browser SpeechRecognition (free, no API key, works instantly).
     *    Recognized text is sent via `call:speech` → server translates + TTS → other user.
     *    This bypasses the Whisper dependency entirely.
     * 2. FALLBACK: Server-side PCM → Whisper STT (if browser STT not available,
     *    e.g. non-Chrome browser or insecure HTTP context on non-localhost).
     */
    const hasBrowserSTT = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (hasBrowserSTT && sttMode === 'speaker') {
      // Use browser STT directly — most reliable path for voice translation.
      // Browser captures mic → recognizes speech → sends text via call:speech →
      // server translates (DeepL/Google) + TTS (Sarvam/Google) → other user hears translated audio.
      console.log('[Translation] Using BROWSER STT (primary) — speech → call:speech → server translate + TTS');
      this.browserSttActive = true;
      await this.startBrowserRecording(socket, callId, resolvedTargetLanguage, onError);
    } else {
      // Fallback: server-side STT via PCM audio chunks → Whisper
      console.log('[Translation] Browser STT not available, using server-side STT (legacy PCM path)');
      this.browserSttActive = false;
      await this.startLegacyRecording(socket, callId, language, onError, existingStream, sttMode);
    }
  }

  // Watchdog timer — restarts recognition if it silently dies
  private sttWatchdog: any = null;
  private lastSttEventAt = 0;

  /**
   * Browser SpeechRecognition — uses the built-in Web Speech API.
   * Transcribes speech locally, then sends text via `call:speech` socket event
   * to the server for translation + TTS generation.
   *
   * FIXES applied for robust continuous recognition:
   * - Fast restart (200ms) when recognition ends (Chrome stops after silence/~60s)
   * - Aggressive interim sending (1.5s timeout) so partial speech isn't lost
   * - Watchdog timer restarts recognition if it silently dies
   * - No minimum length filter on final results (even single words are valid)
   * - Reset interimText on every final so new sentences are captured
   */
  private async startBrowserRecording(
    socket: Socket,
    callId: string,
    targetLanguage: string,
    onError?: (error: string) => void,
  ): Promise<void> {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) throw new Error('SpeechRecognition not supported');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1; // Fewer alternatives = faster results
    const sttLang = this.speakerLanguage && this.speakerLanguage !== 'en-US'
      ? this.speakerLanguage
      : (navigator.language || 'en-US');
    recognition.lang = sttLang;
    console.log(`[BrowserSTT] Language set to: ${sttLang} (browser: ${navigator.language})`);

    // Track interim text for timeout-based sending
    let interimText = '';
    let interimTimer: any = null;
    // Track what was already sent to avoid duplicates
    let lastSentText = '';
    // Track consecutive restart failures
    let restartFailures = 0;
    const MAX_RESTART_FAILURES = 10;

    const sendSpeech = (text: string, isInterim = false) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Dedup: don't send if we already sent the same (or very similar) text
      if (trimmed === lastSentText) {
        console.log(`[BrowserSTT] Skipping duplicate: "${trimmed}"`);
        return;
      }
      // Also skip if the final is a substring of what we already sent as interim
      if (!isInterim && lastSentText && lastSentText.includes(trimmed)) {
        console.log(`[BrowserSTT] Skipping final (already sent as part of interim): "${trimmed}"`);
        return;
      }
      lastSentText = trimmed;
      console.log(`[BrowserSTT] Sending ${isInterim ? 'interim' : 'final'}: "${trimmed}" → call:speech`);
      socket.emit('call:speech', { callId, text: trimmed });
    };

    recognition.onresult = (event: any) => {
      this.lastSttEventAt = Date.now();
      restartFailures = 0; // Got a result, reset failure counter

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Clear any pending interim timer
          if (interimTimer) { clearTimeout(interimTimer); interimTimer = null; }

          const text = result[0].transcript.trim();
          if (text) {
            console.log(`[BrowserSTT] Final: "${text}" (confidence: ${result[0].confidence?.toFixed(2)})`);
            sendSpeech(text, false);
          }
          interimText = ''; // Reset so next sentence starts fresh
        } else {
          // Interim result — accumulate and send if no final comes within 800ms
          const interim = result[0].transcript.trim();
          if (interim && interim !== interimText) {
            interimText = interim;
            if (interimTimer) clearTimeout(interimTimer);
            interimTimer = setTimeout(() => {
              if (interimText.length >= 2) {
                sendSpeech(interimText, true);
                interimText = '';
              }
            }, 800);
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      this.lastSttEventAt = Date.now();
      console.error('[BrowserSTT] Error:', event.error);
      if (event.error === 'not-allowed') {
        this.isActive = false;
        this.browserRecognition = null;
        this.clearSttWatchdog();
        onError?.('Microphone permission denied');
      } else if (event.error === 'no-speech') {
        // Silence — this is normal, onend will restart
        console.log('[BrowserSTT] No speech detected, will restart...');
      } else if (event.error === 'aborted') {
        console.log('[BrowserSTT] Aborted — will retry on end');
      } else if (event.error === 'network') {
        console.log('[BrowserSTT] Network error — will retry on end');
      } else {
        console.warn('[BrowserSTT] Unexpected error:', event.error);
      }
    };

    recognition.onend = () => {
      // Send any accumulated interim text before restarting
      if (interimTimer) { clearTimeout(interimTimer); interimTimer = null; }
      if (interimText.length >= 2) {
        console.log(`[BrowserSTT] Sending remaining interim before restart: "${interimText}"`);
        sendSpeech(interimText);
        interimText = '';
      }

      // Fast restart — 200ms to minimize gap
      if (this.isActive && this.browserRecognition === recognition) {
        const delay = restartFailures > 3 ? 1000 : 200;
        setTimeout(() => {
          if (this.isActive && this.browserRecognition === recognition) {
            try {
              recognition.start();
              restartFailures = 0;
              console.log('[BrowserSTT] Restarted recognition');
            } catch (err: any) {
              restartFailures++;
              console.warn(`[BrowserSTT] Restart failed (${restartFailures}/${MAX_RESTART_FAILURES}):`, err.message);
              if (restartFailures >= MAX_RESTART_FAILURES) {
                console.error('[BrowserSTT] Too many restart failures, creating new instance');
                this.browserRecognition = null;
                restartFailures = 0;
                // Create a fresh SpeechRecognition instance
                this.startBrowserRecording(socket, callId, targetLanguage, onError);
              }
            }
          }
        }, delay);
      }
    };

    // Start with retry logic
    const startRecognition = () => {
      try {
        recognition.start();
        this.lastSttEventAt = Date.now();
      } catch (err: any) {
        if (err.message?.includes('already started')) return;
        console.warn('[BrowserSTT] Start failed, retrying in 300ms:', err.message);
        setTimeout(() => {
          try { recognition.start(); this.lastSttEventAt = Date.now(); } catch {}
        }, 300);
      }
    };
    startRecognition();
    this.browserRecognition = recognition;
    this.isActive = true;

    // Watchdog: restart recognition if no events received for 10 seconds
    this.clearSttWatchdog();
    this.sttWatchdog = setInterval(() => {
      if (!this.isActive || !this.browserRecognition) {
        this.clearSttWatchdog();
        return;
      }
      const silentMs = Date.now() - this.lastSttEventAt;
      if (silentMs > 10000) {
        console.warn(`[BrowserSTT] Watchdog: no events for ${(silentMs / 1000).toFixed(0)}s, restarting...`);
        try {
          this.browserRecognition.abort();
        } catch {}
        // onend handler will restart it
      }
    }, 5000);

    console.log(`[BrowserSTT] Started speech recognition for call ${callId}, target language: ${targetLanguage}`);
  }

  private clearSttWatchdog() {
    if (this.sttWatchdog) {
      clearInterval(this.sttWatchdog);
      this.sttWatchdog = null;
    }
  }

  /**
   * PUBLIC fallback: Start browser SpeechRecognition when server-side Whisper STT fails.
   * This captures the user's mic via the browser's built-in speech recognition (free, no API key),
   * then sends recognized text via `call:speech` to the server for translation + TTS.
   *
   * The server's `call:speech` handler translates using DeepL/Google (no OpenAI needed)
   * and generates TTS via Sarvam/ElevenLabs/Google, then sends `call:translated-text` back.
   */
  startBrowserSttFallback(socket: Socket, callId: string, targetLanguage: string): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[BrowserSTT Fallback] SpeechRecognition not supported in this browser');
      return;
    }
    // Stop any existing legacy/Whisper recording first
    this.legacyIsRecording = false;
    if (this.legacyScriptProcessor) {
      this.legacyScriptProcessor.onaudioprocess = null;
      try { this.legacyScriptProcessor.disconnect(); } catch {}
    }

    console.log(`[BrowserSTT Fallback] Starting browser speech recognition as Whisper fallback for call ${callId}`);
    this.activeSocket = socket;
    this.activeCallId = callId;
    this.browserSttActive = true;
    this.startBrowserRecording(socket, callId, targetLanguage);
  }

  /** Check if browser STT is currently running as the primary/fallback STT */
  isBrowserSttRunning(): boolean {
    return this.browserSttActive && this.browserRecognition !== null;
  }

  /**
   * Stop ONLY the legacy/Whisper recording without touching browser STT.
   * Used when falling back from Whisper to browser STT to avoid killing the fallback.
   */
  stopLegacyOnly(socket?: Socket | null, callId?: string): void {
    // Stop listener-mode recording
    this.stopListenerRecording(socket, callId);

    // Stop legacy PCM recording
    this.legacyIsRecording = false;
    if (this.legacyScriptProcessor) {
      this.legacyScriptProcessor.onaudioprocess = null;
      try { this.legacyScriptProcessor.disconnect(); } catch {}
      this.legacyScriptProcessor = null;
    }
    if (this.legacyMicSource) {
      try { this.legacyMicSource.disconnect(); } catch {}
      this.legacyMicSource = null;
    }
    if (this.legacyAudioContext) {
      this.legacyAudioContext.close().catch(() => {});
      this.legacyAudioContext = null;
    }
    if (this.legacyMicStream) {
      if (!this.legacyIsShared) {
        this.legacyMicStream.getTracks().forEach((t) => t.stop());
      }
      this.legacyMicStream = null;
      this.legacyIsShared = false;
    }

    if (socket && callId) {
      socket.emit('call:stop-stt', { callId });
    }
    console.log('[Translation] Stopped legacy/Whisper recording (browser STT preserved)');
  }

  /**
   * ElevenLabs Conversational AI agent with WebRTC.
   * Note: Requires SERVER_URL to be publicly accessible (won't work on localhost).
   */
  private async startElevenLabsAgent(
    socket: Socket,
    callId: string,
    language: string,
    onError?: (error: string) => void,
    otherUserId?: string,
    targetLanguage?: string,
  ): Promise<void> {
    const userId = this.getMyUserId();
    const apiBase = getApiBaseUrl();
    const token = sessionStorage.getItem('accessToken');
    const resolvedOtherUserId = otherUserId || '';
    const resolvedTargetLanguage = targetLanguage || language;

    console.log(`[TranslationAgent] Starting agent for call ${callId}, target=${resolvedTargetLanguage}`);

    const tokenResponse = await fetch(
      `${apiBase}/translation-agent/conversation-token?callId=${callId}&userId=${userId}&otherUserId=${resolvedOtherUserId}&targetLanguage=${resolvedTargetLanguage}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get agent token: ${await tokenResponse.text()}`);
    }

    const tokenData = await tokenResponse.json();
    const signedUrl = tokenData.token;
    const agentId = tokenData.agentId;
    const systemPrompt = tokenData.systemPrompt;

    if (!signedUrl && !agentId) throw new Error('No signed URL or agent ID received');

    const sessionConfig: any = {
      overrides: {
        agent: { prompt: { prompt: systemPrompt }, firstMessage: '' },
        tts: { voiceId: undefined },
      },
      onConnect: ({ conversationId }: { conversationId: string }) => {
        console.log('[TranslationAgent] Connected, conversation:', conversationId);
        this.isActive = true;
      },
      onDisconnect: () => { this.isActive = false; },
      onError: (message: string) => { console.error('[TranslationAgent] Error:', message); onError?.(message); },
      onMessage: (props: { message: string; source: string; role: string }) => {
        console.log(`[TranslationAgent] [${props.role}]: ${props.message}`);
      },
      onModeChange: ({ mode }: { mode: string }) => { console.log('[TranslationAgent] Mode:', mode); },
      onStatusChange: ({ status }: { status: string }) => { console.log('[TranslationAgent] Status:', status); },
    };

    if (signedUrl) { sessionConfig.signedUrl = signedUrl; }
    else { sessionConfig.agentId = agentId; sessionConfig.connectionType = 'webrtc'; }

    this.conversation = await Conversation.startSession(sessionConfig);
    if (this.conversation?.setVolume) {
      this.conversation.setVolume({ volume: 0 });
    }
    this.isActive = true;
    console.log('[TranslationAgent] Agent session started');
  }

  /** Get current user ID from auth store (sessionStorage-backed, per-tab isolated) */
  private getMyUserId(): string {
    try {
      // Primary: Zustand auth store persisted in sessionStorage (multi-account safe)
      const authStr = sessionStorage.getItem('auth');
      if (authStr) {
        const auth = JSON.parse(authStr);
        const user = auth?.state?.user;
        if (user) return user.id || user._id || '';
      }
      // Fallback: localStorage 'user' key (legacy)
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.id || user._id || '';
      }
    } catch {}
    return '';
  }

  // ─── LISTENER MODE: Second STT instance for capturing remote stream ────────
  private listenerAudioContext: AudioContext | null = null;
  private listenerScriptProcessor: ScriptProcessorNode | null = null;
  private listenerMicSource: MediaStreamAudioSourceNode | null = null;
  private listenerIsRecording = false;

  /**
   * Start a LISTENER-mode STT session that captures the remote WebRTC stream
   * (the other user's voice arriving on THIS device) and sends it to the server
   * for translation. The server translates and sends TTS audio back to THIS user.
   *
   * This is the KEY feature: when User B toggles translation, User B hears
   * User A's speech translated into User B's preferred language.
   */
  async startListenerRecording(
    socket: Socket,
    callId: string,
    remoteStream: MediaStream,
    language: string,
    onError?: (error: string) => void,
  ): Promise<void> {
    // DISABLED: Listener-mode recording (remote stream capture via ScriptProcessor → Whisper)
    // was capturing background TV audio (MBC news etc.) and sending it for translation.
    // All translation now goes through browser STT → call:speech → server translate + TTS.
    console.log('[TranslationListener] DISABLED — listener-mode recording no longer used. Use browser STT instead.');
    return;
  }

  /** Stop listener-mode recording */
  stopListenerRecording(socket?: Socket | null, callId?: string): void {
    this.listenerIsRecording = false;
    if (this.listenerScriptProcessor) {
      this.listenerScriptProcessor.onaudioprocess = null;
      try { this.listenerScriptProcessor.disconnect(); } catch {}
      this.listenerScriptProcessor = null;
    }
    if (this.listenerMicSource) {
      try { this.listenerMicSource.disconnect(); } catch {}
      this.listenerMicSource = null;
    }
    if (this.listenerAudioContext) {
      this.listenerAudioContext.close().catch(() => {});
      this.listenerAudioContext = null;
    }
    if (socket && callId) {
      socket.emit('call:stop-stt-listener', { callId });
    }
    console.log('[TranslationListener] Listener recording stopped');
  }

  /**
   * Legacy fallback: PCM recording via ScriptProcessorNode.
   * Used when ElevenLabs agent connection fails.
   */
  private legacyAudioContext: AudioContext | null = null;
  private legacyScriptProcessor: ScriptProcessorNode | null = null;
  private legacyMicSource: MediaStreamAudioSourceNode | null = null;
  private legacyMicStream: MediaStream | null = null;
  private legacyIsShared = false;
  private legacyIsRecording = false;

  private downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      result[i] = buffer[Math.round(i * ratio)];
    }
    return result;
  }

  private async startLegacyRecording(
    socket: Socket,
    callId: string,
    language: string,
    onError?: (error: string) => void,
    existingStream?: MediaStream,
    sttMode: 'speaker' | 'listener' = 'speaker',
  ): Promise<void> {
    // DISABLED: Legacy PCM → Whisper STT path removed. All STT now uses browser SpeechRecognition.
    // If browser STT is not available, inform the user instead of falling back to server-side Whisper.
    console.log('[TranslationService] Legacy PCM recording DISABLED — browser STT is the only supported path');
    onError?.('Speech recognition requires Chrome browser with SpeechRecognition support');
  }

  /** Stop recording — ends browser STT, ElevenLabs agent, or legacy recording */
  async stopRecording(socket?: Socket | null, callId?: string): Promise<void> {
    // Stop listener-mode recording (remote stream capture)
    this.stopListenerRecording(socket, callId);

    // Stop Browser SpeechRecognition
    this.browserSttActive = false;
    this.clearSttWatchdog();
    if (this.browserRecognition) {
      try {
        this.browserRecognition.onend = null; // Prevent auto-restart
        this.browserRecognition.abort();
      } catch {}
      this.browserRecognition = null;
      console.log('[BrowserSTT] Stopped');
    }

    // Stop ElevenLabs agent
    if (this.conversation) {
      try {
        await this.conversation.endSession();
      } catch (err) {
        console.warn('[TranslationAgent] Error ending session:', err);
      }
      this.conversation = null;
      this.isActive = false;
      console.log('[TranslationAgent] Session ended');
    }

    // Stop legacy recording
    this.legacyIsRecording = false;
    if (this.legacyScriptProcessor) {
      this.legacyScriptProcessor.onaudioprocess = null;
      try { this.legacyScriptProcessor.disconnect(); } catch {}
      this.legacyScriptProcessor = null;
    }
    if (this.legacyMicSource) {
      try { this.legacyMicSource.disconnect(); } catch {}
      this.legacyMicSource = null;
    }
    if (this.legacyAudioContext) {
      this.legacyAudioContext.close().catch(() => {});
      this.legacyAudioContext = null;
    }
    if (this.legacyMicStream) {
      if (!this.legacyIsShared) {
        this.legacyMicStream.getTracks().forEach((t) => t.stop());
      }
      this.legacyMicStream = null;
      this.legacyIsShared = false;
    }

    if (socket && callId) {
      socket.emit('call:stop-stt', { callId });
    }

    // Clear echo prevention references
    this.activeSocket = null;
    this.activeCallId = null;

    console.log('[TranslationService] Recording stopped');
  }

  /** Play audio from base64-encoded mp3 data (received translation from other user) */
  async speakFromBase64(base64Audio: string, onEnd?: () => void, text?: string, language?: string): Promise<void> {
    // Enqueue with a small cap so we don't get seconds of latency under load.
    this.audioQueue.push({ base64: base64Audio, text: text || '', language: language || 'en', onEnd });
    while (this.audioQueue.length > this.MAX_AUDIO_QUEUE_SIZE) {
      // Drop the oldest items first to keep the newest translation most relevant.
      this.audioQueue.shift();
    }
    console.log(`[TTS] Enqueued audio (queue size: ${this.audioQueue.length}, text: "${text?.substring(0, 30) || ''}", lang: ${language})`);
    if (this.activeCallId) {
      this.logStage('translated_receive', this.activeCallId, {
        audioBytes: base64Audio ? Math.floor((base64Audio.length * 3) / 4) : 0,
        queueSize: this.audioQueue.length,
        language: language || 'en',
      });
    }

    if (!this.isPlayingQueue) {
      this.processAudioQueue();
    }
  }

  private async processAudioQueue(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlayingQueue = false;
      // Resume STT when queue is fully drained
      if (this.activeSocket && this.activeCallId) {
        this.activeSocket.emit('call:resume-stt', { callId: this.activeCallId });
      }
      return;
    }

    this.isPlayingQueue = true;
    const item = this.audioQueue.shift()!;

    // Pause STT during TTS playback to prevent echo
    if (this.activeSocket && this.activeCallId) {
      this.activeSocket.emit('call:pause-stt', { callId: this.activeCallId });
    }

    console.log(`[TTS] Playing translated audio (base64 length: ${item.base64?.length || 0}, text: "${item.text?.substring(0, 30)}", lang: ${item.language})`);

    const onItemEnd = () => {
      item.onEnd?.();
      // Process next in queue
      this.processAudioQueue();
    };

    if (!item.base64 || item.base64.length < 100) {
      if (item.text && item.language) {
        const playedSynth = this.speakWithSpeechSynthesis(item.text, item.language, onItemEnd);
        if (!playedSynth) onItemEnd();
      } else {
        onItemEnd();
      }
      return;
    }

    try {
      const binaryStr = atob(item.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // Method 1: AudioContext
      const played = await this.playViaAudioContext(bytes.buffer, onItemEnd);
      if (played) return;

      // Method 2: HTMLAudioElement
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const playedHtml = await this.playViaAudioElement(blob, onItemEnd);
      if (playedHtml) return;

      // Method 3: SpeechSynthesis
      if (item.text && item.language) {
        const playedSynth = this.speakWithSpeechSynthesis(item.text, item.language, onItemEnd);
        if (playedSynth) return;
      }

      console.error('[TTS] All playback methods failed');
      onItemEnd();
    } catch (err) {
      console.error('[TTS] Failed to decode base64 audio:', err);
      if (item.text && item.language) {
        const playedSynth = this.speakWithSpeechSynthesis(item.text, item.language, onItemEnd);
        if (!playedSynth) onItemEnd();
      } else {
        onItemEnd();
      }
    }
  }

  /** Speak translated text using server-side TTS, with SpeechSynthesis fallback */
  async speak(text: string, language: string, onEnd?: () => void): Promise<void> {
    this.stopSpeaking();

    // Pause STT during TTS playback to prevent echo
    if (this.activeSocket && this.activeCallId) {
      this.activeSocket.emit('call:pause-stt', { callId: this.activeCallId });
    }

    const onEndWithResume = () => {
      if (this.activeSocket && this.activeCallId) {
        this.activeSocket.emit('call:resume-stt', { callId: this.activeCallId });
      }
      onEnd?.();
    };

    try {
      const response = await translationApi.tts(text, language);
      const blob = response.data as Blob;
      if (blob.size < 100) throw new Error('Audio blob too small');

      const arrayBuffer = await blob.arrayBuffer();
      const played = await this.playViaAudioContext(arrayBuffer, onEndWithResume);
      if (played) return;

      const playedHtml = await this.playViaAudioElement(blob, onEndWithResume);
      if (playedHtml) return;

      throw new Error('AudioContext and HTMLAudio both failed');
    } catch {
      const played = this.speakWithSpeechSynthesis(text, language, onEndWithResume);
      if (!played) onEndWithResume();
    }
  }

  /** Stop all playback and clear the audio queue */
  stopSpeaking(): void {
    // Clear queued audio
    this.audioQueue = [];
    this.isPlayingQueue = false;

    if (this.playbackSource) {
      try { this.playbackSource.stop(); } catch {}
      this.playbackSource = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.cleanupAudio();
    }
    if (this.currentUtterance) {
      window.speechSynthesis?.cancel();
      this.currentUtterance = null;
    }

    // Ensure STT does not remain paused if playback is stopped mid-queue.
    if (this.activeSocket && this.activeCallId) {
      this.activeSocket.emit('call:resume-stt', { callId: this.activeCallId });
    }
  }

  /** Pre-warm AudioContext — call during user interaction (e.g. call connect) to unlock audio */
  warmupAudioContext(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.playbackContext || this.playbackContext.state === 'closed') {
        this.playbackContext = new AudioCtx();
      }
      if (this.playbackContext.state === 'suspended') {
        this.playbackContext.resume().catch(() => {});
      }
      console.log('[TTS] AudioContext pre-warmed, state:', this.playbackContext.state);
    } catch (err) {
      console.warn('[TTS] Failed to pre-warm AudioContext:', err);
    }
  }

  /** Check browser support */
  static isSupported(): { stt: boolean; tts: boolean } {
    const hasBrowserSTT = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    const hasMediaDevices = !!navigator.mediaDevices?.getUserMedia;
    return {
      stt: hasBrowserSTT || hasMediaDevices,
      tts: true,
    };
  }

  private cleanupAudio(): void {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      // Remove from DOM if it was added
      if (this.currentAudio.parentNode) {
        this.currentAudio.parentNode.removeChild(this.currentAudio);
      }
      this.currentAudio = null;
    }
  }
}

// Singleton instance
export const translationService = new TranslationService();
