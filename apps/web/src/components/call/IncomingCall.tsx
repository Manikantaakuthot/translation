import { useEffect, useRef } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { callsApi } from '../../api/client';

/** Unlock browser audio playback — must be called during a user gesture (click/tap) */
function unlockAudioPlayback() {
  try {
    const audio = document.createElement('audio');
    audio.setAttribute('playsinline', '');
    audio.volume = 0.01;
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    audio.play().then(() => {
      audio.pause();
      audio.remove();
    }).catch(() => { audio.remove(); });
  } catch {}
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctx.resume().then(() => ctx.close());
  } catch {}
}

/**
 * WhatsApp-style ringtone using Web Audio API oscillators.
 * Pattern: two short beeps (ring-ring), pause, repeat.
 */
function createRingtone(): { start: () => void; stop: () => void } {
  let ctx: AudioContext | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const playRingBurst = () => {
    if (!ctx || stopped) return;
    try {
      // First beep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 440;
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.4);

      // Second beep (slightly higher pitch for WhatsApp-like "ring-ring")
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 520;
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.5);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.9);
    } catch {}
  };

  return {
    start: () => {
      stopped = false;
      try {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        playRingBurst();
        // Repeat every 2.5 seconds (ring-ring ... pause ... ring-ring)
        intervalId = setInterval(playRingBurst, 2500);
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

export default function IncomingCall() {
  const { incomingCall, setIncomingCall, setActiveCall } = useCallStore();
  const ringtoneRef = useRef<ReturnType<typeof createRingtone> | null>(null);

  // Play ringtone when incoming call is active
  useEffect(() => {
    if (!incomingCall) return;
    const ringtone = createRingtone();
    ringtoneRef.current = ringtone;
    ringtone.start();
    return () => {
      ringtone.stop();
      ringtoneRef.current = null;
    };
  }, [incomingCall?.callId]);

  // Auto-reject after 45 seconds if not answered (WhatsApp-style missed call)
  useEffect(() => {
    if (!incomingCall) return;
    const timer = setTimeout(() => {
      ringtoneRef.current?.stop();
      callsApi.reject(incomingCall.callId).catch(() => {});
      setIncomingCall(null);
    }, 45000);
    return () => clearTimeout(timer);
  }, [incomingCall?.callId]);

  if (!incomingCall) return null;

  const handleAnswer = async () => {
    try {
      // Stop ringtone immediately
      ringtoneRef.current?.stop();
      // IMPORTANT: Unlock audio DURING the click gesture, before any async work
      unlockAudioPlayback();

      await callsApi.answer(incomingCall.callId);
      setActiveCall({
        callId: incomingCall.callId,
        otherUserId: incomingCall.callerId,
        otherUserName: incomingCall.callerName,
        type: incomingCall.type,
        isInitiator: false,
      });
      setIncomingCall(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async () => {
    try {
      ringtoneRef.current?.stop();
      await callsApi.reject(incomingCall.callId);
      setIncomingCall(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0b141a] flex items-center justify-center z-50">
      {/* Animated pulse rings behind avatar */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.6; }
          50% { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        @keyframes pulse-ring-delay {
          0% { transform: scale(0.8); opacity: 0; }
          25% { transform: scale(0.8); opacity: 0.5; }
          75% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        .pulse-ring-1 { animation: pulse-ring 2s ease-out infinite; }
        .pulse-ring-2 { animation: pulse-ring-delay 2s ease-out infinite 0.5s; }
        .pulse-ring-3 { animation: pulse-ring-delay 2s ease-out infinite 1s; }
      `}</style>

      <div className="flex flex-col items-center w-full max-w-sm mx-4">
        {/* Avatar with pulse rings */}
        <div className="relative mb-6">
          {/* Pulse rings */}
          <div className="pulse-ring-1 absolute inset-0 w-28 h-28 rounded-full border-2 border-[#128C7E]/50" />
          <div className="pulse-ring-2 absolute inset-0 w-28 h-28 rounded-full border-2 border-[#128C7E]/40" />
          <div className="pulse-ring-3 absolute inset-0 w-28 h-28 rounded-full border-2 border-[#128C7E]/30" />
          {/* Avatar */}
          <div className="relative w-28 h-28 rounded-full bg-[#128C7E]/30 flex items-center justify-center text-[#25D366] text-5xl font-bold border-2 border-[#128C7E]/40">
            {incomingCall.callerName[0]?.toUpperCase() || '?'}
          </div>
        </div>

        {/* Caller info */}
        <h2 className="text-white text-2xl font-semibold">{incomingCall.callerName}</h2>
        <p className="text-gray-400 mt-2 text-sm">
          Incoming {incomingCall.type === 'video' ? 'video' : 'voice'} call...
        </p>

        {/* Action buttons */}
        <div className="flex justify-center gap-16 mt-12">
          {/* Reject */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleReject}
              className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 active:scale-90 transition-all shadow-lg shadow-red-500/30"
            >
              <PhoneOff size={28} />
            </button>
            <span className="text-gray-400 text-xs">Decline</span>
          </div>
          {/* Accept */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleAnswer}
              className="w-16 h-16 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:bg-[#1fba59] active:scale-90 transition-all shadow-lg shadow-[#25D366]/30"
            >
              <Phone size={28} />
            </button>
            <span className="text-gray-400 text-xs">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
