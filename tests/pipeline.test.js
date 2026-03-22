'use strict';

/**
 * Pipeline integration tests.
 * Verifies STT → MT → TTS pipeline order and fallback behavior.
 */

// Mock all external dependencies before requiring pipeline
jest.mock('../server/stt', () => ({
  transcribeWithWhisper: jest.fn(),
  transcribeWithGoogle: jest.fn(),
}));

jest.mock('../server/mt', () => ({
  translateWithDeepL: jest.fn(),
  translateWithAzure: jest.fn(),
}));

jest.mock('../server/tts', () => ({
  synthesizeWithAzure: jest.fn(),
  synthesizeWithGoogle: jest.fn(),
}));

const { translateAudio } = require('../server/pipeline');
const { transcribeWithWhisper, transcribeWithGoogle } = require('../server/stt');
const { translateWithDeepL, translateWithAzure } = require('../server/mt');
const { synthesizeWithAzure, synthesizeWithGoogle } = require('../server/tts');

describe('Translation Pipeline', () => {
  const mockAudio = new Float32Array(640).fill(0.5);
  const mockTTSBuffer = Buffer.from('fake-audio-data');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls STT → MT → TTS in correct order', async () => {
    const callOrder = [];

    transcribeWithWhisper.mockImplementation(async () => {
      callOrder.push('stt');
      return { text: 'Hello world', detectedLanguage: 'en' };
    });

    translateWithDeepL.mockImplementation(async () => {
      callOrder.push('mt');
      return 'Hola mundo';
    });

    synthesizeWithAzure.mockImplementation(async () => {
      callOrder.push('tts');
      return mockTTSBuffer;
    });

    const result = await translateAudio(mockAudio, 'en', 'es');

    expect(callOrder).toEqual(['stt', 'mt', 'tts']);
    expect(result.transcript).toBe('Hello world');
    expect(result.translation).toBe('Hola mundo');
    expect(result.audioBuffer).toBe(mockTTSBuffer);
    expect(typeof result.latencyMs).toBe('number');
  });

  test('falls back to Google STT when Whisper fails', async () => {
    transcribeWithWhisper.mockRejectedValue(new Error('Whisper API error'));
    transcribeWithGoogle.mockResolvedValue({ text: 'Hello', detectedLanguage: 'en' });
    translateWithDeepL.mockResolvedValue('Hola');
    synthesizeWithAzure.mockResolvedValue(mockTTSBuffer);

    const result = await translateAudio(mockAudio, 'en', 'es');

    expect(transcribeWithWhisper).toHaveBeenCalledTimes(1);
    expect(transcribeWithGoogle).toHaveBeenCalledTimes(1);
    expect(result.transcript).toBe('Hello');
    expect(result.translation).toBe('Hola');
  });

  test('returns error caption when both STT providers fail', async () => {
    transcribeWithWhisper.mockRejectedValue(new Error('Whisper fail'));
    transcribeWithGoogle.mockRejectedValue(new Error('Google fail'));

    const result = await translateAudio(mockAudio, 'en', 'es');

    expect(result.transcript).toBe('[Could not transcribe]');
    expect(result.audioBuffer).toBeNull();
  });

  test('falls back to Azure MT when DeepL fails', async () => {
    transcribeWithWhisper.mockResolvedValue({ text: 'Hello', detectedLanguage: 'en' });
    translateWithDeepL.mockRejectedValue(new Error('DeepL fail'));
    translateWithAzure.mockResolvedValue('Hola');
    synthesizeWithAzure.mockResolvedValue(mockTTSBuffer);

    const result = await translateAudio(mockAudio, 'en', 'es');

    expect(translateWithDeepL).toHaveBeenCalledTimes(1);
    expect(translateWithAzure).toHaveBeenCalledTimes(1);
    expect(result.translation).toBe('Hola');
  });

  test('returns original text when both MT providers fail', async () => {
    transcribeWithWhisper.mockResolvedValue({ text: 'Hello', detectedLanguage: 'en' });
    translateWithDeepL.mockRejectedValue(new Error('DeepL fail'));
    translateWithAzure.mockRejectedValue(new Error('Azure fail'));

    const result = await translateAudio(mockAudio, 'en', 'es');

    expect(result.translation).toBe('Hello'); // Original text as fallback
    expect(result.audioBuffer).toBeNull();
  });

  test('falls back to Google TTS when Azure TTS fails', async () => {
    transcribeWithWhisper.mockResolvedValue({ text: 'Hello', detectedLanguage: 'en' });
    translateWithDeepL.mockResolvedValue('Hola');
    synthesizeWithAzure.mockRejectedValue(new Error('Azure TTS fail'));
    synthesizeWithGoogle.mockResolvedValue(mockTTSBuffer);

    const result = await translateAudio(mockAudio, 'en', 'es');

    expect(synthesizeWithAzure).toHaveBeenCalledTimes(1);
    expect(synthesizeWithGoogle).toHaveBeenCalledTimes(1);
    expect(result.audioBuffer).toBe(mockTTSBuffer);
  });

  test('returns caption only when both TTS providers fail', async () => {
    transcribeWithWhisper.mockResolvedValue({ text: 'Hello', detectedLanguage: 'en' });
    translateWithDeepL.mockResolvedValue('Hola');
    synthesizeWithAzure.mockRejectedValue(new Error('Azure fail'));
    synthesizeWithGoogle.mockRejectedValue(new Error('Google fail'));

    const result = await translateAudio(mockAudio, 'en', 'es');

    expect(result.translation).toBe('Hola');
    expect(result.audioBuffer).toBeNull(); // Caption only, no audio
  });

  test('skips translation when source and target language match', async () => {
    transcribeWithWhisper.mockResolvedValue({ text: 'Hello', detectedLanguage: 'en' });
    synthesizeWithAzure.mockResolvedValue(mockTTSBuffer);

    const result = await translateAudio(mockAudio, 'en', 'en');

    expect(translateWithDeepL).not.toHaveBeenCalled();
    expect(translateWithAzure).not.toHaveBeenCalled();
    expect(result.translation).toBe('Hello');
  });

  test('handles empty transcription gracefully', async () => {
    transcribeWithWhisper.mockResolvedValue({ text: '', detectedLanguage: 'en' });

    const result = await translateAudio(mockAudio, 'en', 'es');

    expect(translateWithDeepL).not.toHaveBeenCalled();
    expect(result.audioBuffer).toBeNull();
  });

  test('does not send audio data to wrong user (isolation check)', async () => {
    // Run two parallel pipelines and verify results are independent
    transcribeWithWhisper
      .mockResolvedValueOnce({ text: 'Hello', detectedLanguage: 'en' })
      .mockResolvedValueOnce({ text: 'Bonjour', detectedLanguage: 'fr' });

    translateWithDeepL
      .mockResolvedValueOnce('Hola')
      .mockResolvedValueOnce('Hello');

    synthesizeWithAzure
      .mockResolvedValueOnce(Buffer.from('audio-for-B'))
      .mockResolvedValueOnce(Buffer.from('audio-for-A'));

    const [resultA, resultB] = await Promise.all([
      translateAudio(mockAudio, 'en', 'es'),
      translateAudio(mockAudio, 'fr', 'en'),
    ]);

    expect(resultA.translation).toBe('Hola');
    expect(resultB.translation).toBe('Hello');
    expect(resultA.audioBuffer.toString()).toBe('audio-for-B');
    expect(resultB.audioBuffer.toString()).toBe('audio-for-A');
  });
});
