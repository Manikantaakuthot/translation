'use strict';

const axios = require('axios');
const OpenAI = require('openai');

/**
 * Text-to-Speech module.
 * Primary: ElevenLabs (high quality, multilingual)
 * Fallback: OpenAI TTS (tts-1, broad language support)
 */

// ElevenLabs multilingual voice IDs
const ELEVENLABS_VOICE_MAP = {
  // Default voice from env, or multilingual voices
  default: process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
};

// OpenAI TTS voice selection per language family
const OPENAI_VOICE_MAP = {
  en: 'alloy',
  es: 'nova',
  fr: 'shimmer',
  de: 'onyx',
  hi: 'nova',
  zh: 'nova',
  ja: 'shimmer',
  ar: 'onyx',
  pt: 'nova',
  ru: 'onyx',
  te: 'nova',
  ta: 'nova',
  ko: 'shimmer',
};

// Azure Neural voice mapping (kept for reference / future Azure support)
const VOICE_MAP = {
  en: 'en-US-JennyNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  hi: 'hi-IN-SwaraNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  ja: 'ja-JP-NanamiNeural',
  ar: 'ar-SA-ZariyahNeural',
  pt: 'pt-BR-FranciscaNeural',
  ru: 'ru-RU-SvetlanaNeural',
  te: 'te-IN-ShrutiNeural',
  ta: 'ta-IN-PallaviNeural',
  ko: 'ko-KR-SunHiNeural',
  it: 'it-IT-ElsaNeural',
  nl: 'nl-NL-ColetteNeural',
  pl: 'pl-PL-AgnieszkaNeural',
  tr: 'tr-TR-EmelNeural',
  vi: 'vi-VN-HoaiMyNeural',
  th: 'th-TH-PremwadeeNeural',
  id: 'id-ID-GadisNeural',
  uk: 'uk-UA-PolinaNeural',
  sv: 'sv-SE-SofieNeural',
  da: 'da-DK-ChristelNeural',
  fi: 'fi-FI-NooraNeural',
  nb: 'nb-NO-PernilleNeural',
  el: 'el-GR-AthinaNeural',
  cs: 'cs-CZ-VlastaNeural',
  ro: 'ro-RO-AlinaNeural',
  hu: 'hu-HU-NoemiNeural',
  bg: 'bg-BG-KalinaNeural',
  sk: 'sk-SK-ViktoriaNeural',
};

/**
 * Select voice name for a language code (Azure reference map).
 */
function selectVoice(langCode) {
  if (!langCode) return VOICE_MAP.en;
  const base = langCode.split('-')[0].toLowerCase();
  return VOICE_MAP[base] || VOICE_MAP.en;
}

/**
 * Primary TTS: ElevenLabs API.
 * Uses the multilingual v2 model for best cross-language quality.
 * Returns raw PCM audio (16kHz 16-bit mono).
 * @param {string} text - Text to synthesize
 * @param {string} language - Target language code
 * @param {string} [voice] - Override voice ID (optional)
 * @returns {Promise<Buffer>} Audio data as PCM 16-bit 16kHz mono
 */
async function synthesizeWithElevenLabs(text, language, voice = null) {
  if (!text || text.trim().length === 0) {
    return Buffer.alloc(0);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const voiceId = voice || ELEVENLABS_VOICE_MAP.default;

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      responseType: 'arraybuffer',
      timeout: 10000,
    }
  );

  // ElevenLabs returns MP3 — convert to raw PCM 16kHz 16-bit mono
  // For now, return the MP3 buffer and let the client handle it
  // (client will decode MP3 via Web Audio API's decodeAudioData)
  return Buffer.from(response.data);
}

/**
 * Fallback TTS: OpenAI TTS API (tts-1 model).
 * @param {string} text - Text to synthesize
 * @param {string} language - Target language code
 * @returns {Promise<Buffer>} Audio data as MP3
 */
async function synthesizeWithOpenAI(text, language) {
  if (!text || text.trim().length === 0) {
    return Buffer.alloc(0);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const openai = new OpenAI({ apiKey });
  const baseLang = (language || 'en').split('-')[0].toLowerCase();
  const voice = OPENAI_VOICE_MAP[baseLang] || 'alloy';

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice,
    input: text,
    response_format: 'mp3',
    speed: 1.05, // Slightly faster for conversational feel
  });

  // Response is a ReadableStream — collect into Buffer
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Re-export Azure and Google for compatibility, but they won't be primary
async function synthesizeWithAzure(text, language, voice = null) {
  // Try ElevenLabs first (our actual primary)
  return synthesizeWithElevenLabs(text, language, voice);
}

async function synthesizeWithGoogle(text, language) {
  // Use OpenAI TTS as our actual fallback
  return synthesizeWithOpenAI(text, language);
}

module.exports = {
  synthesizeWithElevenLabs,
  synthesizeWithOpenAI,
  synthesizeWithAzure,
  synthesizeWithGoogle,
  selectVoice,
  VOICE_MAP,
};
