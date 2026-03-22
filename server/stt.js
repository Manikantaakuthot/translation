'use strict';

const OpenAI = require('openai');

/**
 * Speech-to-Text module.
 * Primary: OpenAI Whisper API (whisper-1)
 * Fallback: Google Cloud Speech-to-Text
 */

let openaiClient = null;
function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Convert Float32 PCM to 16-bit WAV buffer for Whisper API.
 * Output: 16kHz mono 16-bit PCM in WAV container.
 * @param {Float32Array} float32Array
 * @param {number} sampleRate
 * @returns {Buffer}
 */
function float32ToWavBuffer(float32Array, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = float32Array.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);       // Sub-chunk size
  buffer.writeUInt16LE(1, 20);        // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Convert Float32 [-1.0, 1.0] → Int16 [-32768, 32767]
  let offset = headerSize;
  for (let i = 0; i < float32Array.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Array[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    buffer.writeInt16LE(Math.round(int16), offset);
    offset += 2;
  }

  return buffer;
}

/**
 * Primary STT: OpenAI Whisper API.
 * @param {Float32Array} audioBuffer - PCM audio data at 16kHz mono
 * @param {string|null} language - ISO 639-1 code, or null/auto for auto-detect
 * @returns {Promise<{ text: string, detectedLanguage: string|null }>}
 */
async function transcribeWithWhisper(audioBuffer, language = null) {
  const wavBuffer = float32ToWavBuffer(audioBuffer);

  // Create a File-like object for the OpenAI SDK
  const file = new File([wavBuffer], 'audio.wav', { type: 'audio/wav' });

  const params = {
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
  };

  // If language is specified (not auto), pass hint to Whisper
  if (language && language !== 'auto') {
    params.language = language.split('-')[0].toLowerCase();
  }

  const response = await getOpenAI().audio.transcriptions.create(params);

  return {
    text: (response.text || '').trim(),
    detectedLanguage: response.language || null,
  };
}

/**
 * Fallback STT: Google Cloud Speech-to-Text.
 * @param {Float32Array} audioBuffer - PCM audio data at 16kHz mono
 * @param {string|null} language - BCP-47 language code
 * @returns {Promise<{ text: string, detectedLanguage: string|null }>}
 */
async function transcribeWithGoogle(audioBuffer, language = null) {
  const speech = require('@google-cloud/speech');
  const client = new speech.SpeechClient();

  const wavBuffer = float32ToWavBuffer(audioBuffer);
  const audioContent = wavBuffer.toString('base64');

  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: language && language !== 'auto' ? language : 'en-US',
    enableAutomaticPunctuation: true,
    model: 'latest_long',
  };

  // Enable multi-language detection when auto-detecting
  if (!language || language === 'auto') {
    config.alternativeLanguageCodes = [
      'en-US', 'es-ES', 'fr-FR', 'de-DE', 'hi-IN',
      'zh-CN', 'ja-JP', 'ar-SA', 'pt-BR', 'ru-RU',
      'ko-KR', 'te-IN', 'ta-IN',
    ];
  }

  const request = {
    audio: { content: audioContent },
    config,
  };

  const [response] = await client.recognize(request);

  const transcript = response.results
    .map((r) => r.alternatives[0]?.transcript || '')
    .join(' ')
    .trim();

  const detectedLang = response.results[0]?.languageCode || null;

  return {
    text: transcript,
    detectedLanguage: detectedLang,
  };
}

module.exports = {
  transcribeWithWhisper,
  transcribeWithGoogle,
  float32ToWavBuffer,
};
