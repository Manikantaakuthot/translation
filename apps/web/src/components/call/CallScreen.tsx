import { useEffect, useRef, useState } from 'react';
import { PhoneOff, Languages, Mic, MicOff, Volume2, VolumeX, Video, VideoOff, Wifi, WifiOff } from 'lucide-react';
import SimplePeer from 'simple-peer';
import { useCallStore } from '../../store/callStore';
import { callsApi, webrtcApi } from '../../api/client';
import { useSocket } from '../../hooks/useSocket';
import { useAuthStore } from '../../store/authStore';
import { useTranslationStore, LANGUAGE_OPTIONS } from '../../store/translationStore';
import { TranslationService, translationService } from '../../services/TranslationService';

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Ring-back tone using Web Audio API — the "ring...ring..." sound the caller hears
 * Pattern: 400Hz+450Hz dual-tone for 2s, silence for 4s, repeat (US standard ring-back)
 */
function createRingBackTone(): { start: () => void; stop: () => void } {
  let ctx: AudioContext | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const playBurst = () => {
    if (!ctx || stopped) return;
    try {
      const now = ctx.currentTime;
      // 400Hz tone
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 400;
      const gain1 = ctx.createGain();
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.setValueAtTime(0.15, now + 1.8);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 2.0);

      // 450Hz tone (combined = US ring-back)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 450;
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.15, now);
      gain2.gain.setValueAtTime(0.15, now + 1.8);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now);
      osc2.stop(now + 2.0);
    } catch {}
  };

  return {
    start: () => {
      stopped = false;
      try {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        playBurst();
        // Repeat every 6 seconds (2s ring + 4s silence)
        intervalId = setInterval(playBurst, 6000);
      } catch {}
    },
    stop: () => {
      stopped = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (ctx) {
        ctx.close().catch(() => {});
        ctx = null;
      }
    },
  };
}

export default function CallScreen() {
  const { activeCall, setActiveCall } = useCallStore();
  const { accessToken, user: currentUser } = useAuthStore();
  const { socket } = useSocket(accessToken);
  const { preferredLanguage, setPreferredLanguage } = useTranslationStore();

  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'connected' | 'failed' | 'ended'>('ringing');
  const [translationActive, setTranslationActive] = useState(false);
  const translationActiveRef = useRef(false);
  const [callLang, setCallLang] = useState(preferredLanguage);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [hasReceivedTranslation, setHasReceivedTranslation] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteStreamReady, setRemoteStreamReady] = useState(false);
  const [voiceTranslationAvailable, setVoiceTranslationAvailable] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [sttStatus, setSttStatus] = useState<'off' | 'starting' | 'listening' | 'error' | 'unsupported' | 'mic-denied'>('off');
  const [sttError, setSttError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [langChangeToast, setLangChangeToast] = useState('');
  const translationPlaybackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Connection quality state
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'disconnected'>('good');

  // Ref to avoid stale closure for currentUser.id in socket listeners
  const currentUserIdRef = useRef(currentUser?.id);
  currentUserIdRef.current = currentUser?.id;
  const isRemoteSpeakingRef = useRef(false);
  isRemoteSpeakingRef.current = isRemoteSpeaking;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingSignalsRef = useRef<any[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const iceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Ring-back tone ref
  const ringBackRef = useRef<ReturnType<typeof createRingBackTone> | null>(null);

  // Track whether the call has been answered (for initiator: wait for call:answered event)
  const callAnsweredRef = useRef(!activeCall?.isInitiator);

  // Call duration timer
  useEffect(() => {
    if (callStatus !== 'connected') return;
    const interval = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  // Ring-back tone for caller while ringing
  useEffect(() => {
    if (callStatus === 'ringing' && activeCall?.isInitiator) {
      const ringBack = createRingBackTone();
      ringBackRef.current = ringBack;
      ringBack.start();
      return () => {
        ringBack.stop();
        ringBackRef.current = null;
      };
    } else {
      // Stop ring-back when call status changes
      ringBackRef.current?.stop();
      ringBackRef.current = null;
    }
  }, [callStatus, activeCall?.isInitiator]);

  // 60-second timeout for caller — if no answer, end the call (WhatsApp-style "No answer")
  useEffect(() => {
    if (!activeCall?.isInitiator || callStatus !== 'ringing') return;
    const timer = setTimeout(() => {
      console.log('[CallScreen] No answer after 60s, ending call');
      ringBackRef.current?.stop();
      callsApi.end(activeCall.callId).catch(() => {});
      setCallStatus('ended');
      setTimeout(() => setActiveCall(null), 1500);
    }, 60000);
    return () => clearTimeout(timer);
  }, [activeCall?.isInitiator, activeCall?.callId, callStatus]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const logVoiceStage = (stage: string, details?: Record<string, any>) => {
    const callId = activeCall?.callId || 'none';
    const payload = details
      ? Object.entries(details)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(' ')
      : '';
    console.log(`[voice_stage_client] ${stage} callId=${callId}${payload ? ` ${payload}` : ''}`);
  };


  const cleanup = () => {
    if (iceTimeoutRef.current) {
      clearTimeout(iceTimeoutRef.current);
      iceTimeoutRef.current = null;
    }
    retryCountRef.current = 0;
    peerRef.current?.destroy();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    // Clean up audio element (don't remove from DOM — it's rendered in JSX)
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
    setRemoteStreamReady(false);
    // Close Web Audio context (used for speaker amplification)
    if (mediaSourceRef.current) {
      try { mediaSourceRef.current.disconnect(); } catch {}
      mediaSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      gainNodeRef.current = null;
    }
    // Stop ring-back tone
    ringBackRef.current?.stop();
    ringBackRef.current = null;
  };

  // Pre-check: the click-to-translate button should be enabled only when:
  // - the browser can play/parse audio (AudioContext exists)
  // - the remote stream is present (so we can transcribe remote speech on this device)
  useEffect(() => {
    if (!activeCall) {
      setVoiceTranslationAvailable(false);
      return;
    }
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ok = !!AudioCtx;
    setVoiceTranslationAvailable(ok);
  }, [activeCall]);

  const handleEnd = async () => {
    translationActiveRef.current = false;
    translationService.stopRecording(socket, activeCall?.callId);
    translationService.stopSpeaking();
    if (activeCall) {
      try { await callsApi.end(activeCall.callId); } catch {}
    }
    cleanup();
    setActiveCall(null);
    setCallStatus('ringing');
    setTranslationActive(false);
    setCallDuration(0);
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleSpeaker = () => {
    const newSpeakerState = !isSpeakerOn;
    const audioEl = remoteAudioRef.current;
    if (!audioEl) { setIsSpeakerOn(newSpeakerState); return; }

    if (newSpeakerState) {
      // Speaker ON: route audio element through Web Audio API gain for amplification
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        if (!mediaSourceRef.current) {
          mediaSourceRef.current = ctx.createMediaElementSource(audioEl);
        }
        const gain = ctx.createGain();
        gain.gain.value = 3.0;
        gainNodeRef.current = gain;
        mediaSourceRef.current.connect(gain);
        gain.connect(ctx.destination);
        console.log('[CallScreen] Speaker ON — gain 3.0');
      } catch (err: any) {
        console.warn('[CallScreen] Speaker amplification failed:', err.message);
      }
    } else {
      // Speaker OFF: disconnect gain, reconnect source directly to destination
      if (gainNodeRef.current) {
        try { gainNodeRef.current.disconnect(); } catch {}
        gainNodeRef.current = null;
      }
      if (mediaSourceRef.current && audioContextRef.current) {
        try { mediaSourceRef.current.connect(audioContextRef.current.destination); } catch {}
      }
      console.log('[CallScreen] Speaker OFF — normal volume');
    }
    setIsSpeakerOn(newSpeakerState);
  };

  const toggleVideo = () => {
    const stream = localStreamRef.current;
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  };

  // WebRTC call setup
  useEffect(() => {
    if (!activeCall || !socket) return;

    let cancelled = false;

    const applyRemoteAudioState = () => {
      const audioEl = remoteAudioRef.current;
      if (!audioEl) return;
      const muteForTranslation = translationActiveRef.current && isRemoteSpeakingRef.current;
      // Fail-safe: keep original call audio audible unless translated playback is active.
      audioEl.muted = muteForTranslation;
      audioEl.volume = muteForTranslation ? 0 : 1.0;
      console.log(
        `[Translation] Remote audio state: muted=${audioEl.muted} vol=${audioEl.volume} (translation=${translationActiveRef.current ? 'ON' : 'OFF'} speaking=${isRemoteSpeakingRef.current ? 'YES' : 'NO'})`,
      );
    };

    const attachRemoteStream = (remoteStream: MediaStream) => {
      const audioTracks = remoteStream.getAudioTracks();
      console.log('[CallScreen] Attaching remote stream, audio tracks:', audioTracks.length, audioTracks.map(t => `${t.label}:enabled=${t.enabled}:state=${t.readyState}`));
      remoteStreamRef.current = remoteStream;
      setRemoteStreamReady(audioTracks.length > 0);

      // Remote stream arriving = call is working, set connected status (only if answered)
      if (callAnsweredRef.current) setCallStatus('connected');
      logVoiceStage('webrtc_connected', { remoteAudioTracks: audioTracks.length });

      // Use the persistent <audio> element rendered in JSX (avoids autoplay policy issues)
      const audioEl = remoteAudioRef.current;
      if (audioEl) {
        audioEl.srcObject = remoteStream;
        // Only mute remote raw audio while translated playback is active/recent.
        applyRemoteAudioState();
        console.log('[CallScreen] Stream attached, remote audio routing synced');
        // Try to play with retries — handles autoplay policy
        const tryPlay = (attempt: number) => {
          audioEl.play().then(() => {
            console.log('[CallScreen] Audio element playing (attempt', attempt, ')');
            logVoiceStage('remote_audio_playing', { attempt });
          }).catch((err: any) => {
            console.warn('[CallScreen] Audio play attempt', attempt, 'failed:', err.message);
            if (attempt < 5) {
              setTimeout(() => tryPlay(attempt + 1), 500 * attempt);
            }
          });
        };
        tryPlay(1);
      }

      // Set video element for video calls
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch((e: any) => console.warn('[CallScreen] Video play failed:', e));
      }
    };

    const createPeer = (stream: MediaStream, iceServers: RTCIceServer[]) => {
      if (cancelled) return;
      setCallStatus('connecting');

      console.log('[CallScreen] Creating SimplePeer, initiator:', activeCall.isInitiator, 'ICE servers:', iceServers.length);
      const peer = new SimplePeer({
        initiator: activeCall.isInitiator,
        trickle: true,
        stream,
        config: { iceServers },
      });

      peer.on('signal', (data) => {
        if (data.type === 'offer') {
          console.log('[CallScreen] Sending offer to', activeCall.otherUserId);
          socket.emit('call:offer', {
            callId: activeCall.callId,
            calleeId: activeCall.otherUserId,
            sdp: data,
          });
        } else if (data.type === 'answer') {
          console.log('[CallScreen] Sending answer to', activeCall.otherUserId);
          socket.emit('call:answer', {
            callId: activeCall.callId,
            callerId: activeCall.otherUserId,
            sdp: data,
          });
        } else if ((data as any).candidate) {
          console.log('[CallScreen] Sending ICE candidate:', (data as any).candidate?.candidate?.substring(0, 60));
          socket.emit('call:ice-candidate', {
            targetUserId: activeCall.otherUserId,
            candidate: data,
          });
        }
      });

      peer.on('connect', () => {
        console.log('[CallScreen] Peer connected!');
        logVoiceStage('peer_connected');
        if (iceTimeoutRef.current) {
          clearTimeout(iceTimeoutRef.current);
          iceTimeoutRef.current = null;
        }
        // Only transition to connected if the call was actually answered
        if (callAnsweredRef.current) setCallStatus('connected');
      });
      peer.on('stream', (remoteStream) => {
        console.log('[CallScreen] Got remote stream, tracks:', remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`));
        attachRemoteStream(remoteStream);
      });

      peer.on('track', (track: MediaStreamTrack, stream: MediaStream) => {
        console.log('[CallScreen] Got remote track:', track.kind, track.enabled);
        attachRemoteStream(stream);
      });
      peer.on('error', (err) => {
        console.error('[CallScreen] Peer error:', err);
        // Don't immediately fail — WebRTC errors can be transient
        // The ICE timeout retry logic will handle retries
      });
      peer.on('close', () => {
        console.log('[CallScreen] Peer closed');
        // Only show ended status — don't call handleEnd() which notifies the other side
        if (callAnsweredRef.current) {
          setCallStatus('ended');
          // Give user 2 seconds to see "Call ended" before clearing
          setTimeout(() => setActiveCall(null), 2000);
        }
      });

      // Monitor ICE connection state for connection quality indicator
      const pc = (peer as any)._pc as RTCPeerConnection | undefined;
      if (pc) {
        pc.addEventListener('iceconnectionstatechange', () => {
          const state = pc.iceConnectionState;
          console.log('[CallScreen] ICE connection state:', state);
          switch (state) {
            case 'connected':
            case 'completed':
              setConnectionQuality('excellent');
              break;
            case 'checking':
              setConnectionQuality('good');
              break;
            case 'disconnected':
              setConnectionQuality('disconnected');
              break;
            case 'failed':
              console.error('[CallScreen] ICE connection failed — TURN server may be unavailable');
              setConnectionQuality('poor');
              setCallStatus('failed');
              break;
          }
        });
        pc.addEventListener('icegatheringstatechange', () => {
          console.log('[CallScreen] ICE gathering state:', pc.iceGatheringState);
        });
        pc.addEventListener('connectionstatechange', () => {
          console.log('[CallScreen] Connection state:', pc.connectionState);
          if (pc.connectionState === 'connected') {
            setConnectionQuality('excellent');
          } else if (pc.connectionState === 'disconnected') {
            setConnectionQuality('disconnected');
          }
        });
        pc.addEventListener('signalingstatechange', () => {
          console.log('[CallScreen] Signaling state:', pc.signalingState);
        });
      }

      peerRef.current = peer;

      // Flush any signals (offer/answer/ICE) that arrived before the peer was ready
      const queued = pendingSignalsRef.current.splice(0);
      for (const signal of queued) {
        peer.signal(signal);
      }

      // ICE connection timeout — retry if stuck
      if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current);
      iceTimeoutRef.current = setTimeout(async () => {
        const pc = (peer as any)._pc as RTCPeerConnection | undefined;
        const iceState = pc?.iceConnectionState;
        if (iceState === 'connected' || iceState === 'completed') return;

        console.warn('[CallScreen] ICE timeout after 20s, state:', iceState, 'retry:', retryCountRef.current);
        if (retryCountRef.current < 2) {
          retryCountRef.current++;
          peer.destroy();
          peerRef.current = null;
          pendingSignalsRef.current = [];

          let freshIceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;
          try {
            const config = await webrtcApi.getConfig();
            if (config.data?.iceServers?.length) freshIceServers = config.data.iceServers;
          } catch {}
          console.log('[CallScreen] Retrying with fresh ICE servers:', freshIceServers.length);
          createPeer(stream, freshIceServers);
        } else {
          console.error('[CallScreen] Max retries reached, connection failed');
          setCallStatus('failed');
        }
      }, 20000);
    };

    const signalPeerOrQueue = (signal: any) => {
      if (peerRef.current) {
        peerRef.current.signal(signal);
      } else {
        pendingSignalsRef.current.push(signal);
      }
    };

    const onOffer = (data: { callId: string; sdp: any }) => {
      console.log('[CallScreen] Received offer for call:', data.callId);
      if (data.callId === activeCall.callId) {
        signalPeerOrQueue(data.sdp);
      }
    };
    const onAnswer = (data: { callId: string; sdp: any }) => {
      console.log('[CallScreen] Received answer for call:', data.callId);
      if (data.callId === activeCall.callId) {
        signalPeerOrQueue(data.sdp);
      }
    };
    const onIceCandidate = (data: { candidate: any; fromUserId: string }) => {
      console.log('[CallScreen] Received ICE candidate from:', data.fromUserId);
      if (data.fromUserId === activeCall.otherUserId) {
        signalPeerOrQueue(data.candidate);
      }
    };
    const onCallEnded = (data: { callId: string }) => {
      if (data.callId === activeCall.callId) {
      console.log('[CallScreen] Remote user ended the call');
      translationActiveRef.current = false;
      translationService.stopRecording(socket, activeCall.callId);
      translationService.stopSpeaking();
      setCallStatus('ended');
      setTranslationActive(false);
        // Give user 2 seconds to see "Call ended" before clearing
        setTimeout(() => {
          cleanup();
          setActiveCall(null);
        }, 2000);
      }
    };

    // Listen for translated text + audio from the OTHER user
    const onTranslatedText = (data: {
      callId: string;
      originalText: string;
      translatedText: string;
      targetLanguage: string;
      fromUserId: string;
      audioBase64?: string;
    }) => {
      if (data.callId !== activeCall.callId) return;
      if (data.fromUserId === currentUserIdRef.current) return;
      if (!translationActiveRef.current) {
        // Keep normal two-way call audio untouched unless user explicitly enabled translation.
        return;
      }

      console.log('[Translation] Received:', data.translatedText, 'lang:', data.targetLanguage, 'hasAudio:', !!data.audioBase64, 'audioSize:', data.audioBase64?.length || 0);
      logVoiceStage('translated_receive', {
        fromUserId: data.fromUserId,
        targetLanguage: data.targetLanguage,
        audioBytes: data.audioBase64 ? Math.floor((data.audioBase64.length * 3) / 4) : 0,
      });
      setHasReceivedTranslation(true);
      setIsRemoteSpeaking(true);

      const onPlaybackEnd = () => {
        console.log('[Translation] TTS playback finished');
        if (translationPlaybackTimeoutRef.current) {
          clearTimeout(translationPlaybackTimeoutRef.current);
          translationPlaybackTimeoutRef.current = null;
        }
        setIsRemoteSpeaking(false);
      };

      // Play translated audio
      if (data.audioBase64) {
        translationService.speakFromBase64(data.audioBase64, onPlaybackEnd, data.translatedText, data.targetLanguage);
      } else {
        translationService.speak(data.translatedText, data.targetLanguage, onPlaybackEnd);
      }
      // Safety release: never keep raw call audio muted indefinitely.
      if (translationPlaybackTimeoutRef.current) clearTimeout(translationPlaybackTimeoutRef.current);
      translationPlaybackTimeoutRef.current = setTimeout(() => {
        setIsRemoteSpeaking(false);
      }, 7000);
    };

    const onLanguageChanged = (data: { callId: string; userId: string; language: string }) => {
      if (data.callId !== activeCall.callId) return;
      const langName = LANGUAGE_OPTIONS.find((l) => l.code === data.language)?.name || data.language;
      console.log(`[Translation] Other user changed language to ${langName}`);
    };

    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:ended', onCallEnded);
    socket.on('call:translated-text', onTranslatedText);
    socket.on('call:language-changed', onLanguageChanged);
    console.log('[Translation] Registered call:translated-text listener in WebRTC effect for call', activeCall.callId);

    // For the initiator: track call:answered independently of getUserMedia
    let answered = false;
    let mediaReady: { stream: MediaStream; iceServers: RTCIceServer[] } | null = null;

    if (activeCall.isInitiator) {
      const onAnswered = (data: { callId: string }) => {
        if (data.callId === activeCall.callId) {
          answered = true;
          callAnsweredRef.current = true;
          socket.off('call:answered', onAnswered);
          if (mediaReady) {
            createPeer(mediaReady.stream, mediaReady.iceServers);
            mediaReady = null;
          }
        }
      };
      socket.on('call:answered', onAnswered);
    }

    const init = async () => {
      try {
        console.log('[CallScreen] init() starting, isInitiator:', activeCall.isInitiator);
        let iceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;
        try {
          const config = await webrtcApi.getConfig();
          if (config.data?.iceServers?.length) {
            iceServers = config.data.iceServers;
            console.log('[CallScreen] Got ICE servers:', iceServers.length, 'servers (includes TURN:', iceServers.some((s: any) => JSON.stringify(s.urls || '').includes('turn')), ')');
          }
        } catch {
          console.warn('Failed to fetch ICE config, using fallback STUN servers');
        }

        console.log('[CallScreen] Requesting getUserMedia...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: activeCall.type === 'video',
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        console.log('[CallScreen] getUserMedia succeeded, tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setIsVideoOn(activeCall.type === 'video');

        if (activeCall.isInitiator) {
          if (answered) {
            console.log('[CallScreen] Initiator: call already answered, creating peer now');
            createPeer(stream, iceServers);
          } else {
            console.log('[CallScreen] Initiator: waiting for call:answered before creating peer');
            mediaReady = { stream, iceServers };
          }
        } else {
          console.log('[CallScreen] Callee: creating peer now');
          createPeer(stream, iceServers);
        }
      } catch (err: any) {
        console.error('[CallScreen] Media/init error:', err);
        // NEVER call handleEnd() here — that sends call:ended to the other user.
        // Instead, create a silent audio stream so WebRTC still connects.
        // The user can still RECEIVE audio and translations even without a mic.
        console.warn('[CallScreen] getUserMedia failed, using silent stream:', err?.name, err?.message);
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = 0; // Silent
          oscillator.connect(gainNode);
          const dest = audioCtx.createMediaStreamDestination();
          gainNode.connect(dest);
          oscillator.start();
          const silentStream = dest.stream;
          localStreamRef.current = silentStream;

          let iceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;
          try {
            const config = await webrtcApi.getConfig();
            if (config.data?.iceServers?.length) iceServers = config.data.iceServers;
          } catch {}

          if (activeCall.isInitiator) {
            if (answered) {
              createPeer(silentStream, iceServers);
            } else {
              mediaReady = { stream: silentStream, iceServers };
            }
          } else {
            createPeer(silentStream, iceServers);
          }
          console.log('[CallScreen] Created silent stream fallback — call will connect without mic');
        } catch (silentErr) {
          console.error('[CallScreen] Silent stream fallback also failed:', silentErr);
          setCallStatus('failed');
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      pendingSignalsRef.current = [];
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:ended', onCallEnded);
      socket.off('call:answered');
      socket.off('call:translated-text', onTranslatedText);
      socket.off('call:language-changed', onLanguageChanged);
      translationService.stopSpeaking();
      if (translationPlaybackTimeoutRef.current) {
        clearTimeout(translationPlaybackTimeoutRef.current);
        translationPlaybackTimeoutRef.current = null;
      }
      cleanup();
    };
  }, [activeCall?.callId, socket]);

  // STT setup — DUAL MODE:
  // 1. SPEAKER mode: capture LOCAL mic → translate → send TTS to the OTHER user
  // 2. LISTENER mode: capture REMOTE stream (other user's voice) → translate → play TTS on THIS device
  // This ensures: when User B toggles translation, User B hears User A's speech translated.
  useEffect(() => {
    if (!translationActive || !activeCall || !socket || callStatus === 'ended' || callStatus === 'failed') {
      if (!translationActive) setSttStatus('off');
      return;
    }
    if (callStatus !== 'connected') {
      setSttStatus('starting');
      return;
    }

    let cancelled = false;

    const onSttStarted = (data: { callId: string }) => {
      if (data.callId === activeCall.callId) {
        console.log('[Translation] Server confirmed STT started');
        logVoiceStage('stt_started');
        setSttStatus('listening');
      }
    };

    const onSttTranscript = (data: { callId: string; text: string; isFinal: boolean }) => {
      if (data.callId === activeCall.callId) {
        setSttStatus('listening');
        if (data.isFinal && data.text.trim()) {
          console.log('[Translation] Final transcript:', data.text);
          logVoiceStage('transcript_final', { chars: data.text.trim().length });
        }
      }
    };

    const onSttError = (data: { callId: string; error: string }) => {
      if (data.callId === activeCall.callId) {
        console.error('[Translation] Server STT error:', data.error);
        logVoiceStage('stt_error', { error: data.error });
        setSttStatus('error');
        setSttError(data.error);
      }
    };

    socket.on('call:stt-started', onSttStarted);
    socket.on('call:stt-transcript', onSttTranscript);
    socket.on('call:stt-error', onSttError);

    // Check STT support
    const support = TranslationService.isSupported();
    if (!support.stt) {
      setSttStatus('unsupported');
      setSttError('Microphone not available');
      console.warn('[Translation] Microphone not supported in this browser');
    } else {
      setSttStatus('starting');
      (async () => {
        try {
          if (cancelled || !translationActiveRef.current) return;
          translationService.warmupAudioContext();
          logVoiceStage('stt_start_request', { mode: 'speaker+listener', targetLanguage: callLang });

          // ─── SPEAKER MODE: Translate MY speech for the other user ───
          console.log(`[Translation] Starting SPEAKER mode STT (my mic → translate → send to other user)`);
          await translationService.startRecording(
            socket,
            activeCall.callId,
            'auto',
            (error) => {
              console.error('[Translation] Speaker recording error:', error);
              if (error.toLowerCase().includes('permission denied') || error.toLowerCase().includes('not-allowed')) {
                setSttStatus('mic-denied');
                setSttError('Microphone permission denied — your speech will not be translated.');
              } else {
                setSttStatus('error');
                setSttError(error);
              }
            },
            undefined,
            activeCall.otherUserId,
            callLang,
            'speaker',
          );

          // ─── LISTENER MODE: Capture REMOTE stream → translate → play on MY device ───
          // This is the KEY: User B hears User A's speech translated into User B's language
          const remoteStream = remoteStreamRef.current;
          if (remoteStream && remoteStream.getAudioTracks().length > 0) {
            console.log(`[Translation] Starting LISTENER mode STT (remote stream → translate → play on my device)`);
            await translationService.startListenerRecording(
              socket,
              activeCall.callId,
              remoteStream,
              'auto',
              (error) => {
                console.warn('[Translation] Listener recording error:', error);
              },
            );
          } else {
            console.warn('[Translation] Remote stream not ready yet — listener mode will start when stream arrives');
          }

          if (cancelled || !translationActiveRef.current) {
            translationService.stopRecording(socket, activeCall.callId);
            return;
          }
          if (!cancelled) setSttStatus('listening');
        } catch (err: any) {
          if (!cancelled) {
            setSttStatus('error');
            setSttError(err?.message || 'Failed to start translation');
          }
        }
      })();
    }

    return () => {
      cancelled = true;
      // Cancel any in-flight async start logic
      // (translationService.stopRecording handles the actual STT session cleanup)
      translationService.stopRecording(socket, activeCall.callId);
      setSttStatus('off');
      socket.off('call:stt-started', onSttStarted);
      socket.off('call:stt-transcript', onSttTranscript);
      socket.off('call:stt-error', onSttError);
    };
  }, [translationActive, callStatus, activeCall?.callId, socket, callLang]);

  // Warm up AudioContext + sync language on connect (NO auto-enable of translation)
  useEffect(() => {
    if ((callStatus === 'connected' || callStatus === 'connecting') && activeCall && socket) {
      // Pre-warm AudioContext during user interaction context (unlocks audio playback)
      translationService.warmupAudioContext();
      // Sync current UI language to DB so the other user's speech translates to OUR language
      socket.emit('call:update-language', { callId: activeCall.callId, language: callLang });
      console.log('[Translation] Warmed up audio, synced language to DB:', callLang, '(translation is OFF by default — user must enable)');
    }
  }, [callStatus, activeCall?.callId, socket, callLang]);

  // Start listener-mode STT when remote stream becomes available AND translation is active
  // Handles the case where user toggled translation before the remote stream arrived
  useEffect(() => {
    if (!translationActive || !remoteStreamReady || !activeCall || !socket) return;
    const remoteStream = remoteStreamRef.current;
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;

    console.log('[Translation] Remote stream now ready — starting/restarting listener-mode STT');
    translationService.startListenerRecording(
      socket,
      activeCall.callId,
      remoteStream,
      'auto',
      (error) => console.warn('[Translation] Listener recording error:', error),
    );

    return () => {
      // Listener cleanup is handled by the main STT effect's cleanup
    };
  }, [translationActive, remoteStreamReady, activeCall?.callId, socket]);

  // Mute WebRTC remote audio when translation is active (so user only hears translated TTS)
  useEffect(() => {
    translationActiveRef.current = translationActive;
    if (remoteAudioRef.current) {
      const muteForTranslation = translationActive && isRemoteSpeaking;
      remoteAudioRef.current.muted = muteForTranslation;
      remoteAudioRef.current.volume = muteForTranslation ? 0 : 1.0;
      console.log(
        `[Translation] Remote audio state updated ` +
        `(muted=${remoteAudioRef.current.muted}, vol=${remoteAudioRef.current.volume}) ` +
        `(translation=${translationActive ? 'ON' : 'OFF'} speaking=${isRemoteSpeaking ? 'YES' : 'NO'})`,
      );
    }
  }, [translationActive, isRemoteSpeaking]);

  const handleToggleTranslation = () => {
    const hasBrowserSTT = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    console.log(`[Translation] Toggle: active=${translationActive}→${!translationActive}, callStatus=${callStatus}, lang=${callLang}, browserSTT=${hasBrowserSTT}`);
    logVoiceStage('translation_toggle', {
      from: translationActive ? 'on' : 'off',
      to: !translationActive ? 'on' : 'off',
      callStatus,
      language: callLang,
    });
    if (translationActive) {
      // Update ref immediately so incoming translated events are ignored instantly.
      translationActiveRef.current = false;
      translationService.stopRecording(socket, activeCall?.callId);
      translationService.stopSpeaking();
      setTranslationActive(false);
      setIsSpeaking(false);
      setIsRemoteSpeaking(false);
      setHasReceivedTranslation(false);
      setSttStatus('off');
      setSttError('');
    } else {
      // Update ref immediately so incoming translated events are allowed instantly.
      translationActiveRef.current = true;
      // User gesture context — unlock AudioContext NOW (Chrome requires it)
      translationService.warmupAudioContext();
      // Sync language to server immediately
      if (socket && activeCall) {
        socket.emit('call:update-language', { callId: activeCall.callId, language: callLang });
      }
      setSttStatus(callStatus === 'connected' ? 'starting' : 'off');
      setSttError('');
      setHasReceivedTranslation(false);
      setTranslationActive(true);
    }
  };

  const handleLanguageChange = (lang: string) => {
    setCallLang(lang);
    setPreferredLanguage(lang);
    if (socket && activeCall) {
      socket.emit('call:update-language', { callId: activeCall.callId, language: lang });
    }
    const langName = LANGUAGE_OPTIONS.find((l) => l.code === lang)?.name || lang;
    setLangChangeToast(`Switched to ${langName}`);
    setTimeout(() => setLangChangeToast(''), 2000);
  };

  if (!activeCall) return null;

  const selectedLangOption = LANGUAGE_OPTIONS.find((l) => l.code === callLang);
  const isVideoCall = activeCall.type === 'video';

  const statusText = callStatus === 'connected'
    ? formatDuration(callDuration)
    : callStatus === 'ended'
      ? 'Call ended'
      : callStatus === 'failed'
        ? 'Connection failed'
        : callStatus === 'ringing' && activeCall.isInitiator
          ? 'Ringing...'
          : 'Connecting...';

  // Connection quality icon helper
  const renderConnectionQuality = () => {
    if (callStatus !== 'connected') return null;
    const bars = connectionQuality === 'excellent' ? 3 : connectionQuality === 'good' ? 2 : 1;
    const color = connectionQuality === 'excellent' ? 'text-green-400' : connectionQuality === 'good' ? 'text-yellow-400' : connectionQuality === 'disconnected' ? 'text-red-400' : 'text-orange-400';

    return (
      <div className={`flex items-center gap-1 ${color}`}>
        {connectionQuality === 'disconnected' ? (
          <>
            <WifiOff size={14} />
            <span className="text-xs animate-pulse">Reconnecting...</span>
          </>
        ) : (
          <>
            <div className="flex items-end gap-0.5 h-3">
              <div className={`w-1 rounded-sm ${bars >= 1 ? 'bg-current' : 'bg-white/20'}`} style={{ height: '33%' }} />
              <div className={`w-1 rounded-sm ${bars >= 2 ? 'bg-current' : 'bg-white/20'}`} style={{ height: '66%' }} />
              <div className={`w-1 rounded-sm ${bars >= 3 ? 'bg-current' : 'bg-white/20'}`} style={{ height: '100%' }} />
            </div>
            <Wifi size={12} />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#1a2332] flex flex-col z-50">
      {/* Persistent hidden audio element for remote stream — avoids autoplay policy issues */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Video call layout */}
      {isVideoCall && (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-4 right-4 w-28 h-40 object-cover rounded-2xl border-2 border-white/20 shadow-2xl z-10"
          />
        </>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        {/* Top: Translation controls — always visible */}
        <div className="absolute top-4 left-0 right-0 px-4 z-20">
          {/* Name, status, and connection quality when connected */}
          {callStatus === 'connected' && (
            <div className="text-center mb-2">
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-white text-lg font-semibold">{activeCall.otherUserName}</h2>
                {renderConnectionQuality()}
              </div>
              <p className="text-green-400 text-sm mt-0.5">{statusText}</p>
            </div>
          )}

          {/* Translation panel — always visible */}
          <div className="mx-auto max-w-sm bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Languages size={18} className={translationActive ? 'text-[#128C7E]' : 'text-white/50'} />
                <select
                  value={callLang}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-0"
                >
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <option key={lang.code} value={lang.code} className="text-black">
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleToggleTranslation}
                disabled={!voiceTranslationAvailable && !translationActive}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  translationActive
                    ? 'bg-[#128C7E] text-white shadow-lg shadow-[#128C7E]/30'
                    : !voiceTranslationAvailable
                      ? 'bg-white/10 text-white/50 opacity-60 cursor-not-allowed'
                      : 'bg-white/20 text-white/70 hover:bg-white/30'
                }`}
              >
                {translationActive ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* STT status indicator */}
            {translationActive && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                {callStatus === 'ringing' && (
                  <span className="text-white/50">Translation will start when call connects</span>
                )}
                {sttStatus === 'starting' && callStatus !== 'ringing' && (
                  <span className="text-yellow-400 animate-pulse">Starting speech recognition...</span>
                )}
                {sttStatus === 'listening' && (
                  <span className="text-green-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    Translating your voice to {selectedLangOption?.name || callLang}
                  </span>
                )}
                {sttStatus === 'error' && (
                  <span className="text-red-400">Error: {sttError}</span>
                )}
                {sttStatus === 'mic-denied' && (
                  <span className="text-orange-400 flex items-center gap-1">
                    <span>🎤</span> Mic blocked — your voice won't translate, but you can still hear the other side's translations
                  </span>
                )}
                {sttStatus === 'unsupported' && (
                  <span className="text-orange-400">Mic not available — can still receive translations</span>
                )}
              </div>
            )}

            {/* Language change confirmation toast */}
            {langChangeToast && (
              <div className="mt-2 text-xs text-[#128C7E] font-medium text-center animate-pulse">
                {langChangeToast}
              </div>
            )}

            {/* Translation OFF hint */}
            {!translationActive && callStatus === 'connected' && (
              <div className="mt-2 text-xs text-white/40 text-center">
                Tap ON to enable real-time voice translation
              </div>
            )}
            {/* Not ready hint */}
            {!translationActive && (callStatus === 'ringing' || callStatus === 'connecting') && (
              <div className="mt-2 text-xs text-white/40 text-center">
                Waiting for voice stream...
              </div>
            )}
            {!translationActive && callStatus === 'connected' && !voiceTranslationAvailable && (
              <div className="mt-2 text-xs text-orange-400 text-center">
                Voice translation not available in this browser/device
              </div>
            )}
          </div>
        </div>

        {/* Center: Avatar */}
        {!isVideoCall && (
          <div className="flex flex-col items-center">
            <div
              className={`w-32 h-32 rounded-full bg-gray-600 flex items-center justify-center text-5xl font-bold text-white shadow-2xl transition-all duration-300 ${
                isRemoteSpeaking ? 'ring-4 ring-green-400 ring-opacity-60 scale-105' : ''
              }`}
            >
              {activeCall.otherUserName[0]?.toUpperCase() || '?'}
            </div>
            {isRemoteSpeaking && (
              <div className="mt-2 flex items-center gap-1 text-green-400 text-xs">
                <Volume2 size={12} className="animate-pulse" />
                Speaking...
              </div>
            )}

            {/* Name and status below avatar (when not connected) */}
            {callStatus !== 'connected' && (
              <>
                <h2 className="text-white text-2xl font-semibold mt-6">{activeCall.otherUserName}</h2>
                <p className={`mt-2 text-sm ${callStatus === 'failed' ? 'text-red-400' : 'text-gray-400'}`}>
                  {statusText}
                </p>
              </>
            )}

            {/* Name below avatar when connected (mobile style) */}
            {callStatus === 'connected' && (
              <h2 className="text-white/60 text-sm mt-4">{activeCall.type === 'voice' ? 'Voice call' : 'Video call'}</h2>
            )}
          </div>
        )}

      </div>

      {/* Bottom controls — WhatsApp style */}
      <div className="pb-10 pt-4 px-6 relative z-30">
        <div className="flex items-center justify-center gap-5">
          {/* Speaker toggle */}
          <button
            onClick={toggleSpeaker}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              isSpeakerOn ? 'bg-white text-gray-800' : 'bg-white/20 text-white'
            }`}
          >
            {isSpeakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </button>

          {/* Video toggle */}
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              isVideoOn ? 'bg-white text-gray-800' : 'bg-white/20 text-white'
            }`}
          >
            {isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
          </button>

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              isMuted ? 'bg-white text-gray-800' : 'bg-white/20 text-white'
            }`}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          {/* End call */}
          <button
            onClick={handleEnd}
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 active:scale-90 shadow-lg shadow-red-500/40 transition-all"
          >
            <PhoneOff size={24} />
          </button>

        </div>
      </div>
    </div>
  );
}
