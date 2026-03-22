import { Injectable } from '@nestjs/common';
import { LibreTranslateProvider, TranslationResult } from './providers/libre-translate.provider';
import { ElevenLabsService } from './elevenlabs.service';
import * as https from 'https';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const googleTTS = require('google-tts-api');

@Injectable()
export class TranslationService {
  // Languages supported by ElevenLabs eleven_multilingual_v2
  private static readonly ELEVENLABS_SUPPORTED = new Set([
    'en', 'hi', 'ta', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh',
    'ja', 'ko', 'ar', 'tr', 'pl', 'nl', 'sv', 'id', 'fil', 'ro',
    'bg', 'cs', 'da', 'fi', 'hr', 'ms', 'sk', 'uk', 'el', 'vi',
  ]);

  // Indian languages supported by Sarvam AI TTS (better quality than Google TTS)
  private static readonly SARVAM_LANG_MAP: Record<string, string> = {
    hi: 'hi-IN', te: 'te-IN', kn: 'kn-IN', ta: 'ta-IN',
    ml: 'ml-IN', bn: 'bn-IN', gu: 'gu-IN', mr: 'mr-IN',
    or: 'od-IN', pa: 'pa-IN', en: 'en-IN',
  };

  constructor(
    private libreTranslate: LibreTranslateProvider,
    private elevenlabs: ElevenLabsService,
  ) {}

  async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult> {
    if (!text?.trim()) {
      throw new Error('Text cannot be empty');
    }
    return this.libreTranslate.translate(text, targetLanguage, sourceLanguage);
  }

  async textToSpeech(text: string, language: string): Promise<Buffer> {
    if (!text?.trim()) {
      throw new Error('Text cannot be empty');
    }

    // 1. Try Sarvam AI for Indian languages (best quality for Telugu, Kannada, Hindi, etc.)
    const sarvamLang = TranslationService.SARVAM_LANG_MAP[language];
    if (sarvamLang && process.env.SARVAM_API_KEY) {
      try {
        return await this.sarvamTextToSpeech(text, sarvamLang);
      } catch (err: any) {
        console.warn(`[TTS] Sarvam AI failed for "${language}", trying next:`, err.message);
      }
    }

    // 2. Try ElevenLabs for supported languages
    if (TranslationService.ELEVENLABS_SUPPORTED.has(language)) {
      try {
        return await this.elevenlabs.textToSpeech(text, language);
      } catch (err: any) {
        console.warn(`[TTS] ElevenLabs failed for "${language}", falling back to Google TTS:`, err.message);
      }
    }

    // 3. Google TTS as final fallback
    return this.googleTextToSpeech(text, language);
  }

  /** Sarvam AI TTS — high-quality Indian language voices (Telugu, Kannada, Hindi, Tamil, etc.) */
  private async sarvamTextToSpeech(text: string, targetLanguageCode: string): Promise<Buffer> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) throw new Error('SARVAM_API_KEY not set');

    console.log(`[Sarvam TTS] Generating audio for "${text.substring(0, 40)}..." in ${targetLanguageCode}`);

    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: targetLanguageCode,
        speaker: 'anushka',
        model: 'bulbul:v2',
        enable_preprocessing: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sarvam API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (data.audios && data.audios.length > 0) {
      const audioBuffer = Buffer.from(data.audios[0], 'base64');
      console.log(`[Sarvam TTS] Generated ${audioBuffer.length} bytes`);
      return audioBuffer;
    }

    throw new Error('No audio in Sarvam response');
  }

  /** Google TTS — supports 40+ languages including Kannada, Telugu, Malayalam, Bengali */
  private async googleTextToSpeech(text: string, language: string): Promise<Buffer> {
    try {
      console.log(`[Google TTS] Generating audio for "${text.substring(0, 40)}..." in ${language}`);

      // getAllAudioBase64 handles long text by splitting into chunks (200 char limit per request)
      const results = await googleTTS.getAllAudioBase64(text, { lang: language, slow: false });

      // Combine all audio chunks into a single buffer
      const buffers: Buffer[] = [];
      for (const result of results) {
        buffers.push(Buffer.from(result.base64, 'base64'));
      }
      const combined = Buffer.concat(buffers);
      console.log(`[Google TTS] Generated ${combined.length} bytes (${results.length} chunk(s))`);
      return combined;
    } catch (err: any) {
      console.error('[Google TTS] Failed:', err.message);
      throw new Error(`TTS failed: ${err.message}`);
    }
  }

  async detectLanguage(text: string): Promise<string> {
    return this.libreTranslate.detectLanguage(text);
  }

  getSupportedLanguages() {
    return this.libreTranslate.getSupportedLanguages();
  }
}
