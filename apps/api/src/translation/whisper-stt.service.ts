import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

/**
 * OpenAI Whisper STT service — highest accuracy server-side speech recognition.
 * Accepts base64-encoded audio (PCM/WAV/MP3) and returns transcript text.
 */
@Injectable()
export class WhisperSttService {
  private openai: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }

  /**
   * Transcribe audio using OpenAI Whisper.
   * @param audioBase64 - Base64-encoded audio data (WAV, MP3, or raw PCM)
   * @param language - ISO 639-1 language hint (optional, improves accuracy)
   * @param isRawPcm - If true, wraps raw PCM in WAV header before sending
   * @returns { text, detectedLanguage }
   */
  async transcribe(
    audioBase64: string,
    language?: string,
    isRawPcm = false,
  ): Promise<{ text: string; detectedLanguage: string | null }> {
    let audioBuffer: Buffer = Buffer.from(audioBase64, 'base64');

    // If raw PCM (16kHz 16-bit mono), wrap in WAV header
    if (isRawPcm) {
      audioBuffer = this.wrapPcmInWav(audioBuffer) as Buffer;
    }

    const file = new File([new Uint8Array(audioBuffer)], 'audio.wav', { type: 'audio/wav' });

    const params: any = {
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
    };

    if (language && language !== 'auto' && language !== 'unknown') {
      params.language = language.split('-')[0].toLowerCase();
    }

    const response = await this.getClient().audio.transcriptions.create(params);

    return {
      text: (response.text || '').trim(),
      detectedLanguage: (response as any).language || null,
    };
  }

  /**
   * Wrap raw 16-bit PCM buffer in a WAV header (16kHz mono).
   */
  private wrapPcmInWav(pcmBuffer: Buffer, sampleRate = 16000): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const headerSize = 44;
    const header = Buffer.alloc(headerSize);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }
}
