'use strict';

const { transcribeWithWhisper, transcribeWithGoogle } = require('./stt');
const { translateWithDeepL, translateWithAzure } = require('./mt');
const { synthesizeWithAzure, synthesizeWithGoogle } = require('./tts');

/**
 * Translation pipeline orchestrator.
 * Processes audio through STT → MT → TTS with automatic fallback.
 *
 * Primary pipeline: Whisper → DeepL → Azure Neural TTS
 * Fallback pipeline: Google STT → Azure Translator → Google WaveNet TTS
 */

/**
 * Full translation pipeline: audio in source language → audio in target language.
 *
 * @param {Float32Array} audioBuffer - PCM audio at 16kHz mono
 * @param {string} sourceLang - Source language code (or 'auto')
 * @param {string} targetLang - Target language code
 * @returns {Promise<{ audioBuffer: Buffer|null, transcript: string, translation: string, latencyMs: number }>}
 */
async function translateAudio(audioBuffer, sourceLang, targetLang) {
  const startTime = Date.now();
  let transcript = '';
  let translation = '';
  let synthesizedAudio = null;

  // ──── STAGE 1: Speech-to-Text ────
  try {
    const sttResult = await transcribeWithWhisper(audioBuffer, sourceLang);
    transcript = sttResult.text;

    // Update sourceLang if auto-detected
    if ((!sourceLang || sourceLang === 'auto') && sttResult.detectedLanguage) {
      sourceLang = sttResult.detectedLanguage;
    }
  } catch (sttPrimaryError) {
    // Log only metadata, never transcript content
    console.error('[pipeline] Whisper STT failed, falling back to Google:', sttPrimaryError.message);

    try {
      const fallbackResult = await transcribeWithGoogle(audioBuffer, sourceLang);
      transcript = fallbackResult.text;

      if ((!sourceLang || sourceLang === 'auto') && fallbackResult.detectedLanguage) {
        sourceLang = fallbackResult.detectedLanguage;
      }
    } catch (sttFallbackError) {
      console.error('[pipeline] Google STT fallback also failed:', sttFallbackError.message);
      return {
        audioBuffer: null,
        transcript: '[Could not transcribe]',
        translation: '[Could not transcribe]',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // Skip empty transcriptions
  if (!transcript || transcript.trim().length === 0) {
    return {
      audioBuffer: null,
      transcript: '',
      translation: '',
      latencyMs: Date.now() - startTime,
    };
  }

  // If source and target are the same language, skip translation
  const srcBase = (sourceLang || '').split('-')[0].toLowerCase();
  const tgtBase = (targetLang || '').split('-')[0].toLowerCase();
  if (srcBase && tgtBase && srcBase === tgtBase) {
    translation = transcript;
  } else {
    // ──── STAGE 2: Machine Translation ────
    try {
      translation = await translateWithDeepL(transcript, sourceLang, targetLang);
    } catch (mtPrimaryError) {
      console.error('[pipeline] DeepL MT failed, falling back to Azure:', mtPrimaryError.message);

      try {
        translation = await translateWithAzure(transcript, sourceLang, targetLang);
      } catch (mtFallbackError) {
        console.error('[pipeline] Azure MT fallback also failed:', mtFallbackError.message);
        // Return original transcript as-is when translation fails
        return {
          audioBuffer: null,
          transcript,
          translation: transcript, // Show original text
          latencyMs: Date.now() - startTime,
        };
      }
    }
  }

  // Skip empty translations
  if (!translation || translation.trim().length === 0) {
    return {
      audioBuffer: null,
      transcript,
      translation: '',
      latencyMs: Date.now() - startTime,
    };
  }

  // ──── STAGE 3: Text-to-Speech ────
  try {
    synthesizedAudio = await synthesizeWithAzure(translation, targetLang);
  } catch (ttsPrimaryError) {
    console.error('[pipeline] Azure TTS failed, falling back to Google:', ttsPrimaryError.message);

    try {
      synthesizedAudio = await synthesizeWithGoogle(translation, targetLang);
    } catch (ttsFallbackError) {
      console.error('[pipeline] Google TTS fallback also failed:', ttsFallbackError.message);
      // Return caption text only, no audio
      return {
        audioBuffer: null,
        transcript,
        translation,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  const latencyMs = Date.now() - startTime;
  // Log only metadata — never log transcript or translation text
  console.log(`[pipeline] Completed: ${sourceLang} → ${targetLang}, ${latencyMs}ms`);

  return {
    audioBuffer: synthesizedAudio,
    transcript,
    translation,
    latencyMs,
  };
}

module.exports = { translateAudio };
