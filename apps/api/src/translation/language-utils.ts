/**
 * Language code mapping utility.
 * Maps short ISO 639-1 codes (used internally) to BCP 47 locale codes
 * required by external APIs like ElevenLabs TTS and Google TTS.
 */

const BCP47_MAP: Record<string, string> = {
  en: 'en-US',
  te: 'te-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  bn: 'bn-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
  ru: 'ru-RU',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ar: 'ar-SA',
  tr: 'tr-TR',
  vi: 'vi-VN',
  th: 'th-TH',
};

/** Convert a short language code to BCP 47 format for TTS APIs */
export function toBcp47(code: string): string {
  if (!code) return 'en-US';
  // Already a BCP 47 code (contains hyphen)
  if (code.includes('-')) return code;
  return BCP47_MAP[code.toLowerCase()] || code;
}
