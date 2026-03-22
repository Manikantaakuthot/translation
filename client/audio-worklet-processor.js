/**
 * AudioWorkletProcessor for low-latency microphone capture.
 * Captures 40ms frames of Float32 PCM at 16kHz (resampled from 48kHz).
 * Applies a basic noise gate: skips frames below RMS 0.005.
 *
 * Registered as 'mic-processor'.
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Target: 16kHz, 40ms frames = 640 samples
    this.targetSampleRate = 16000;
    this.frameDuration = 0.04; // 40ms
    this.targetFrameSize = this.targetSampleRate * this.frameDuration; // 640
    this.noiseGateThreshold = 0.005;

    // Buffer to accumulate resampled audio until we have a full 40ms frame
    this.buffer = new Float32Array(0);
  }

  /**
   * Downsample from source sample rate (usually 48kHz) to 16kHz.
   * Uses simple linear interpolation for quality.
   */
  downsample(inputBuffer, inputSampleRate) {
    if (inputSampleRate === this.targetSampleRate) {
      return inputBuffer;
    }

    const ratio = inputSampleRate / this.targetSampleRate;
    const outputLength = Math.floor(inputBuffer.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcFloor = Math.floor(srcIndex);
      const srcCeil = Math.min(srcFloor + 1, inputBuffer.length - 1);
      const frac = srcIndex - srcFloor;
      output[i] = inputBuffer[srcFloor] * (1 - frac) + inputBuffer[srcCeil] * frac;
    }

    return output;
  }

  /**
   * Calculate RMS energy for noise gate.
   */
  calculateRMS(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      sum += frame[i] * frame[i];
    }
    return Math.sqrt(sum / frame.length);
  }

  /**
   * Process incoming audio from the microphone.
   * AudioWorklet delivers 128-sample chunks at the device sample rate.
   */
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true; // Keep processor alive
    }

    const channelData = input[0]; // Mono channel

    // Downsample to 16kHz
    const resampled = this.downsample(channelData, sampleRate);

    // Append to accumulation buffer
    const newBuffer = new Float32Array(this.buffer.length + resampled.length);
    newBuffer.set(this.buffer, 0);
    newBuffer.set(resampled, this.buffer.length);
    this.buffer = newBuffer;

    // Extract complete 40ms frames (640 samples each)
    while (this.buffer.length >= this.targetFrameSize) {
      const frame = this.buffer.slice(0, this.targetFrameSize);
      this.buffer = this.buffer.slice(this.targetFrameSize);

      // Noise gate: skip frames below RMS threshold
      const rms = this.calculateRMS(frame);
      if (rms < this.noiseGateThreshold) {
        continue; // Skip silent/noise frames
      }

      // Send frame to main thread via MessagePort
      this.port.postMessage({
        type: 'audio-frame',
        frame: frame.buffer, // Transfer ArrayBuffer for zero-copy
      }, [frame.buffer]);
    }

    return true; // Keep processor alive
  }
}

registerProcessor('mic-processor', MicProcessor);
