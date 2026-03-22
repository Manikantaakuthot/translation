import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as WebSocket from 'ws';
import { toBcp47 } from './language-utils';

export interface SttSession {
  sendAudio(base64Chunk: string): void;
  close(): void;
}

export interface SttCallbacks {
  onTranscript: (text: string, isFinal: boolean, detectedLanguage?: string, avgLogprob?: number) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

@Injectable()
export class ElevenLabsService {
  private apiKey: string;
  private voiceId: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ELEVENLABS_API_KEY') || '';
    this.voiceId = this.configService.get<string>('ELEVENLABS_VOICE_ID') || 'JBFqnCBsd6RMkjVDRZzb';

    if (!this.apiKey) {
      console.warn('[ElevenLabs] No API key configured — STT/TTS will not work');
    } else {
      console.log('[ElevenLabs] Service initialized with voice:', this.voiceId);
    }
  }

  /** Get the best voice ID for a given language */
  private getVoiceForLanguage(language: string): string {
    // Use configured voice as default — can override per language for better pronunciation
    // ElevenLabs multilingual voices work well across languages with the Flash model
    return this.voiceId;
  }

  /** Generate speech audio from text using ElevenLabs TTS */
  async textToSpeech(text: string, language: string): Promise<Buffer> {
    if (!this.apiKey) throw new Error('ElevenLabs API key not configured');
    if (!text?.trim()) throw new Error('Text cannot be empty');

    const voiceId = this.getVoiceForLanguage(language);
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    console.log(`[ElevenLabs TTS] Language: "${language}", voice: ${voiceId}`);
    // eleven_multilingual_v2 auto-detects language from text — do NOT send language_code
    const body = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    });

    return new Promise<Buffer>((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
            Accept: 'audio/mpeg',
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            let errBody = '';
            res.on('data', (chunk) => (errBody += chunk));
            res.on('end', () => {
              console.error(`[ElevenLabs TTS] Error ${res.statusCode}:`, errBody);
              reject(new Error(`ElevenLabs TTS failed (${res.statusCode}): ${errBody}`));
            });
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const audioBuffer = Buffer.concat(chunks);
            console.log(`[ElevenLabs TTS] Generated ${audioBuffer.length} bytes for "${text.substring(0, 40)}..." in ${language}`);
            resolve(audioBuffer);
          });
        },
      );

      req.on('error', (err) => {
        console.error('[ElevenLabs TTS] Request error:', err.message);
        reject(new Error(`ElevenLabs TTS request failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  /** Create a real-time STT WebSocket session with ElevenLabs */
  createSttWebSocket(language: string, callbacks: SttCallbacks): SttSession {
    if (!this.apiKey) {
      callbacks.onError?.('ElevenLabs API key not configured');
      return { sendAudio: () => {}, close: () => {} };
    }

    // VAD tuning: reduce "dead air" threshold so we commit sooner,
    // while keeping a conservative confidence filter on the server.
    // Pass language_code hint to prevent misdetection (e.g., English heard as Marathi)
    const langCode = language && language !== 'auto' ? language.split('-')[0].toLowerCase() : '';
    const langParam = langCode ? `&language_code=${langCode}` : '';
    const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=vad&vad_silence_threshold_secs=0.7&vad_threshold=0.45&min_speech_duration_ms=150&include_language_detection=true&include_timestamps=true${langParam}`;

    console.log(`[ElevenLabs STT] Connecting WebSocket with language hint: ${langCode || 'auto'}`);

    const ws = new WebSocket(wsUrl, {
      headers: { 'xi-api-key': this.apiKey },
    });

    let isOpen = false;
    let pendingChunks: string[] = [];

    ws.on('open', () => {
      console.log('[ElevenLabs STT] WebSocket connected');
      isOpen = true;

      // Flush any audio that arrived before ws opened
      for (const chunk of pendingChunks) {
        ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: chunk }));
      }
      pendingChunks = [];
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.message_type === 'partial_transcript' && msg.text) {
          callbacks.onTranscript(msg.text, false);
        } else if (
          (msg.message_type === 'committed_transcript' || msg.message_type === 'committed_transcript_with_timestamps')
          && msg.text
        ) {
          const detectedLang = msg.language_code || msg.language || undefined;

          // Calculate average logprob (confidence) from word timestamps
          let avgLogprob: number | undefined;
          if (msg.words && Array.isArray(msg.words)) {
            const wordLogprobs = msg.words
              .filter((w: any) => w.type === 'word' && typeof w.logprob === 'number')
              .map((w: any) => w.logprob);
            if (wordLogprobs.length > 0) {
              avgLogprob = wordLogprobs.reduce((a: number, b: number) => a + b, 0) / wordLogprobs.length;
            }
          }

          console.log(`[ElevenLabs STT] Final transcript: "${msg.text}" (lang: ${detectedLang || 'unknown'}, confidence: ${avgLogprob?.toFixed(2) || 'N/A'})`);
          callbacks.onTranscript(msg.text, true, detectedLang, avgLogprob);
        } else if (msg.message_type === 'session_started') {
          console.log('[ElevenLabs STT] Session started:', msg.session_id);
        } else if (msg.type === 'error' || msg.message_type === 'error') {
          console.error('[ElevenLabs STT] Error:', msg);
          callbacks.onError?.(msg.message || msg.error || 'STT error');
        }
      } catch (err) {
        console.error('[ElevenLabs STT] Failed to parse message:', err);
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[ElevenLabs STT] WebSocket error:', err.message);
      callbacks.onError?.(err.message);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString();
      console.log(`[ElevenLabs STT] WebSocket closed: code=${code} reason="${reasonStr}"`);
      if (code === 1008) {
        console.error('[ElevenLabs STT] Invalid request — check WebSocket URL parameters');
      }
      isOpen = false;
      callbacks.onClose?.();
    });

    return {
      sendAudio(base64Chunk: string) {
        if (isOpen && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: base64Chunk }));
        } else if (!isOpen) {
          pendingChunks.push(base64Chunk);
        }
      },
      close() {
        isOpen = false;
        pendingChunks = [];
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      },
    };
  }
}
