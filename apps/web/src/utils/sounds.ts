// Notification sound utility for WhatsApp-like sound effects
// Sounds are generated programmatically using Web Audio API — no external files needed

const SOUND_ENABLED_KEY = 'msg-sounds-enabled';

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
}

export function setSoundEnabled(enabled: boolean) {
  localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
}

let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Ignore audio context errors
  }
}

export function playMessageReceived() {
  playTone(800, 0.15, 'sine', 0.2);
  setTimeout(() => playTone(1000, 0.1, 'sine', 0.15), 100);
}

export function playMessageSent() {
  playTone(600, 0.08, 'sine', 0.1);
}

export function playCallRinging() {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    // Two-tone ring
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now + i * 1.2);
      osc.frequency.setValueAtTime(480, now + i * 1.2 + 0.3);
      gain.gain.setValueAtTime(0.2, now + i * 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 1.2 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 1.2);
      osc.stop(now + i * 1.2 + 0.6);
    }
  } catch {
    // Ignore audio context errors
  }
}

export function playNotification() {
  playTone(523, 0.12, 'sine', 0.2);
  setTimeout(() => playTone(659, 0.12, 'sine', 0.15), 80);
  setTimeout(() => playTone(784, 0.15, 'sine', 0.1), 160);
}
