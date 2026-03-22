'use strict';

/**
 * Voice Activity Detection (VAD) — energy-based silence detection.
 * Maintains per-user rolling buffers and flushes on silence or max duration.
 */

const SAMPLE_RATE = 16000;
const FRAME_DURATION_MS = 40;
const FRAME_SIZE = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 640 samples
const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 300;
const MAX_BUFFER_DURATION_MS = 1500;
const SILENCE_FRAMES_REQUIRED = Math.ceil(SILENCE_DURATION_MS / FRAME_DURATION_MS); // ~8 frames
const MAX_FRAMES = Math.ceil(MAX_BUFFER_DURATION_MS / FRAME_DURATION_MS); // ~38 frames

/**
 * Calculate RMS energy of a Float32 audio frame.
 * @param {Float32Array} frame
 * @returns {number}
 */
function calculateRMS(frame) {
  if (!frame || frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
  }
  return Math.sqrt(sum / frame.length);
}

/**
 * Detect if a single frame represents silence.
 * @param {Float32Array} audioFrame
 * @returns {boolean}
 */
function detectSpeechEnd(audioFrame) {
  const rms = calculateRMS(audioFrame);
  return rms < SILENCE_THRESHOLD;
}

/**
 * Per-user audio buffer manager with VAD logic.
 * Buffers incoming 40ms frames and flushes when:
 *   1. Silence >= 300ms detected (after speech)
 *   2. Buffer exceeds 1500ms regardless
 */
class AudioBufferManager {
  constructor(onFlush) {
    this.frames = [];
    this.silentFrameCount = 0;
    this.onFlush = onFlush;
  }

  /**
   * Append a 40ms PCM frame (Float32Array).
   * Automatically triggers flush when conditions are met.
   * @param {Float32Array} frame
   * @returns {boolean} true if a flush was triggered
   */
  appendFrame(frame) {
    this.frames.push(frame);

    const isSilent = detectSpeechEnd(frame);

    if (isSilent) {
      this.silentFrameCount++;
    } else {
      this.silentFrameCount = 0;
    }

    // Flush condition 1: Silence for >= 300ms after we have speech content
    const shouldFlushSilence =
      this.silentFrameCount >= SILENCE_FRAMES_REQUIRED &&
      this.frames.length > SILENCE_FRAMES_REQUIRED;

    // Flush condition 2: Buffer exceeds 1500ms regardless of speech
    const shouldFlushMaxDuration = this.frames.length >= MAX_FRAMES;

    if (shouldFlushSilence || shouldFlushMaxDuration) {
      this._flush();
      return true;
    }

    return false;
  }

  /**
   * Force flush the buffer (e.g. on disconnect).
   */
  forceFlush() {
    if (this.frames.length > 0) {
      this._flush();
    }
  }

  /** @private */
  _flush() {
    if (this.frames.length === 0) return;

    // Concatenate all frames into a single Float32Array
    const totalLength = this.frames.reduce((sum, f) => sum + f.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const frame of this.frames) {
      combined.set(frame, offset);
      offset += frame.length;
    }

    // Reset state immediately so new frames buffer in parallel
    this.frames = [];
    this.silentFrameCount = 0;

    // Fire callback (pipeline runs async in parallel with new buffering)
    if (this.onFlush) {
      this.onFlush(combined);
    }
  }

  destroy() {
    this.frames = [];
    this.silentFrameCount = 0;
    this.onFlush = null;
  }
}

module.exports = {
  calculateRMS,
  detectSpeechEnd,
  AudioBufferManager,
  SAMPLE_RATE,
  FRAME_SIZE,
  SILENCE_THRESHOLD,
  SILENCE_DURATION_MS,
  MAX_BUFFER_DURATION_MS,
  SILENCE_FRAMES_REQUIRED,
  MAX_FRAMES,
};
