'use strict';

/**
 * VAD (Voice Activity Detection) tests.
 * Verifies silence detection, flush triggers, and buffer management.
 */

const {
  calculateRMS,
  detectSpeechEnd,
  AudioBufferManager,
  SILENCE_THRESHOLD,
  SILENCE_FRAMES_REQUIRED,
  MAX_FRAMES,
  FRAME_SIZE,
} = require('../server/vad');

describe('VAD - calculateRMS', () => {
  test('returns 0 for empty array', () => {
    expect(calculateRMS(new Float32Array(0))).toBe(0);
  });

  test('returns 0 for null input', () => {
    expect(calculateRMS(null)).toBe(0);
  });

  test('returns correct RMS for known signal', () => {
    const frame = new Float32Array(100).fill(0.5);
    const rms = calculateRMS(frame);
    expect(rms).toBeCloseTo(0.5, 5);
  });

  test('returns ~0 for silent frame', () => {
    const frame = new Float32Array(FRAME_SIZE).fill(0);
    expect(calculateRMS(frame)).toBe(0);
  });
});

describe('VAD - detectSpeechEnd', () => {
  test('detects silence for zero-filled frame', () => {
    const silent = new Float32Array(FRAME_SIZE).fill(0);
    expect(detectSpeechEnd(silent)).toBe(true);
  });

  test('detects silence for very low energy frame', () => {
    const quiet = new Float32Array(FRAME_SIZE).fill(0.005);
    expect(detectSpeechEnd(quiet)).toBe(true);
  });

  test('does not detect silence for speech-level frame', () => {
    const speech = new Float32Array(FRAME_SIZE).fill(0.1);
    expect(detectSpeechEnd(speech)).toBe(false);
  });
});

describe('VAD - AudioBufferManager', () => {
  test('flushes after 300ms of silence following speech', () => {
    const flushed = [];
    const manager = new AudioBufferManager((buffer) => flushed.push(buffer));

    // Add some speech frames first
    const speechFrame = new Float32Array(FRAME_SIZE).fill(0.1);
    for (let i = 0; i < 5; i++) {
      manager.appendFrame(speechFrame);
    }
    expect(flushed.length).toBe(0);

    // Now add silence frames until flush triggers
    const silentFrame = new Float32Array(FRAME_SIZE).fill(0);
    for (let i = 0; i < SILENCE_FRAMES_REQUIRED; i++) {
      manager.appendFrame(silentFrame);
    }

    expect(flushed.length).toBe(1);
    // Flushed buffer should contain all frames (speech + silence)
    expect(flushed[0].length).toBe((5 + SILENCE_FRAMES_REQUIRED) * FRAME_SIZE);
  });

  test('force-flushes after 1500ms regardless of speech', () => {
    const flushed = [];
    const manager = new AudioBufferManager((buffer) => flushed.push(buffer));

    // Fill with continuous speech until max duration
    const speechFrame = new Float32Array(FRAME_SIZE).fill(0.1);
    for (let i = 0; i < MAX_FRAMES; i++) {
      manager.appendFrame(speechFrame);
    }

    expect(flushed.length).toBe(1);
    expect(flushed[0].length).toBe(MAX_FRAMES * FRAME_SIZE);
  });

  test('does not flush during continuous speech below max duration', () => {
    const flushed = [];
    const manager = new AudioBufferManager((buffer) => flushed.push(buffer));

    const speechFrame = new Float32Array(FRAME_SIZE).fill(0.1);
    // Add less than MAX_FRAMES of continuous speech
    for (let i = 0; i < MAX_FRAMES - 5; i++) {
      manager.appendFrame(speechFrame);
    }

    expect(flushed.length).toBe(0);
  });

  test('does not flush on silence alone (no prior speech)', () => {
    const flushed = [];
    const manager = new AudioBufferManager((buffer) => flushed.push(buffer));

    // Only silence — SILENCE_FRAMES_REQUIRED frames is exactly the threshold
    // but we need frames.length > SILENCE_FRAMES_REQUIRED to trigger flush
    const silentFrame = new Float32Array(FRAME_SIZE).fill(0);
    for (let i = 0; i < SILENCE_FRAMES_REQUIRED; i++) {
      manager.appendFrame(silentFrame);
    }

    // Should NOT flush because frames.length === SILENCE_FRAMES_REQUIRED (not >)
    expect(flushed.length).toBe(0);
  });

  test('resets buffer after flush and continues buffering', () => {
    const flushed = [];
    const manager = new AudioBufferManager((buffer) => flushed.push(buffer));

    // First utterance
    const speechFrame = new Float32Array(FRAME_SIZE).fill(0.1);
    for (let i = 0; i < 5; i++) manager.appendFrame(speechFrame);

    const silentFrame = new Float32Array(FRAME_SIZE).fill(0);
    for (let i = 0; i < SILENCE_FRAMES_REQUIRED; i++) manager.appendFrame(silentFrame);

    expect(flushed.length).toBe(1);

    // Second utterance
    for (let i = 0; i < 3; i++) manager.appendFrame(speechFrame);
    for (let i = 0; i < SILENCE_FRAMES_REQUIRED; i++) manager.appendFrame(silentFrame);

    expect(flushed.length).toBe(2);
    // Second flush should be smaller
    expect(flushed[1].length).toBe((3 + SILENCE_FRAMES_REQUIRED) * FRAME_SIZE);
  });

  test('forceFlush flushes remaining buffer', () => {
    const flushed = [];
    const manager = new AudioBufferManager((buffer) => flushed.push(buffer));

    const speechFrame = new Float32Array(FRAME_SIZE).fill(0.1);
    for (let i = 0; i < 3; i++) manager.appendFrame(speechFrame);

    manager.forceFlush();

    expect(flushed.length).toBe(1);
    expect(flushed[0].length).toBe(3 * FRAME_SIZE);
  });

  test('forceFlush does nothing when buffer is empty', () => {
    const flushed = [];
    const manager = new AudioBufferManager((buffer) => flushed.push(buffer));

    manager.forceFlush();
    expect(flushed.length).toBe(0);
  });

  test('destroy clears all state', () => {
    const flushed = [];
    const manager = new AudioBufferManager((buffer) => flushed.push(buffer));

    const speechFrame = new Float32Array(FRAME_SIZE).fill(0.1);
    manager.appendFrame(speechFrame);
    manager.destroy();

    expect(manager.frames.length).toBe(0);
    expect(manager.onFlush).toBeNull();
  });
});
