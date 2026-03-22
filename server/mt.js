'use strict';

const axios = require('axios');

/**
 * Machine Translation module.
 * Primary: DeepL API (highest fluency for spoken dialogue)
 * Fallback: Azure Translator ($10/M chars, 100+ languages)
 */

// DeepL uses specific language codes
const DEEPL_LANG_MAP = {
  en: 'EN', 'en-us': 'EN-US', 'en-gb': 'EN-GB',
  es: 'ES', fr: 'FR', de: 'DE', hi: 'HI',
  zh: 'ZH-HANS', 'zh-cn': 'ZH-HANS', 'zh-tw': 'ZH-HANT',
  ja: 'JA', ar: 'AR',
  pt: 'PT-BR', 'pt-br': 'PT-BR', 'pt-pt': 'PT-PT',
  ru: 'RU', ko: 'KO', te: 'TE', ta: 'TA',
  it: 'IT', nl: 'NL', pl: 'PL', tr: 'TR',
  uk: 'UK', vi: 'VI', th: 'TH', id: 'ID',
  sv: 'SV', da: 'DA', fi: 'FI', nb: 'NB',
  el: 'EL', cs: 'CS', ro: 'RO', hu: 'HU',
  bg: 'BG', sk: 'SK', lt: 'LT', lv: 'LV',
  et: 'ET', sl: 'SL',
};

/**
 * The exact spoken-dialogue translation prompt.
 * Used as context for DeepL (and as system prompt for any LLM fallback).
 */
function buildTranslationContext(sourceLang, targetLang) {
  return (
    `You are a professional real-time spoken language interpreter. ` +
    `Translate the INPUT TEXT from ${sourceLang} to ${targetLang}. ` +
    `Rules:\n` +
    `- Preserve the speaker's tone (formal, casual, emotional)\n` +
    `- Keep contractions and natural spoken patterns\n` +
    `- Do NOT add explanations, notes, or alternatives\n` +
    `- Do NOT translate proper nouns (names, places, brands)\n` +
    `- Output ONLY the translated text, nothing else\n` +
    `- If the input is unclear or too short, output it as-is in target language`
  );
}

/**
 * Normalize a language code to DeepL format.
 * @param {string} lang
 * @param {boolean} isTarget - Target lang requires variant for EN
 * @returns {string}
 */
function toDeepLLang(lang, isTarget = false) {
  const normalized = lang.toLowerCase().replace('_', '-');
  if (DEEPL_LANG_MAP[normalized]) return DEEPL_LANG_MAP[normalized];
  const base = normalized.split('-')[0];
  if (DEEPL_LANG_MAP[base]) return DEEPL_LANG_MAP[base];
  if (isTarget && base === 'en') return 'EN-US';
  return lang.toUpperCase();
}

/**
 * Primary MT: DeepL API.
 * @param {string} text - Source text to translate
 * @param {string} sourceLang - Source language code
 * @param {string} targetLang - Target language code
 * @returns {Promise<string>} Translated text
 */
async function translateWithDeepL(text, sourceLang, targetLang) {
  if (!text || text.trim().length === 0) return '';

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error('DEEPL_API_KEY not configured');

  // DeepL free keys end with ':fx'
  const baseUrl = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2'
    : 'https://api.deepl.com/v2';

  const body = {
    text: [text],
    target_lang: toDeepLLang(targetLang, true),
    context: buildTranslationContext(sourceLang, targetLang),
    preserve_formatting: true,
    formality: 'default',
  };

  // source_lang is optional — omit for auto-detect
  if (sourceLang && sourceLang !== 'auto') {
    body.source_lang = toDeepLLang(sourceLang, false);
  }

  const response = await axios.post(`${baseUrl}/translate`, body, {
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 5000,
  });

  const translations = response.data?.translations;
  if (!translations || translations.length === 0) {
    throw new Error('DeepL returned empty translation');
  }

  return translations[0].text;
}

/**
 * Fallback MT: Azure Translator.
 * @param {string} text - Source text to translate
 * @param {string} sourceLang - Source language code
 * @param {string} targetLang - Target language code
 * @returns {Promise<string>} Translated text
 */
async function translateWithAzure(text, sourceLang, targetLang) {
  if (!text || text.trim().length === 0) return '';

  const subscriptionKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'eastus';

  if (!subscriptionKey) throw new Error('AZURE_SPEECH_KEY not configured for translation');

  const baseCode = (lang) => lang.split('-')[0].toLowerCase();

  const params = new URLSearchParams({
    'api-version': '3.0',
    to: baseCode(targetLang),
  });

  if (sourceLang && sourceLang !== 'auto') {
    params.append('from', baseCode(sourceLang));
  }

  const response = await axios.post(
    `https://api.cognitive.microsofttranslator.com/translate?${params}`,
    [{ text }],
    {
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Ocp-Apim-Subscription-Region': region,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    }
  );

  const result = response.data;
  if (!result || result.length === 0 || !result[0].translations?.length) {
    throw new Error('Azure Translator returned empty result');
  }

  return result[0].translations[0].text;
}

module.exports = {
  translateWithDeepL,
  translateWithAzure,
  buildTranslationContext,
  toDeepLLang,
};
