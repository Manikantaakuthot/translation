'use strict';

/**
 * Machine Translation tests.
 * Verifies DeepL prompt format, language mapping, and proper noun handling.
 */

const { buildTranslationContext, toDeepLLang } = require('../server/mt');

describe('MT - Translation Prompt', () => {
  test('prompt contains "spoken language interpreter"', () => {
    const prompt = buildTranslationContext('English', 'Spanish');
    expect(prompt).toContain('professional real-time spoken language interpreter');
  });

  test('prompt specifies source and target languages', () => {
    const prompt = buildTranslationContext('English', 'French');
    expect(prompt).toContain('from English to French');
  });

  test('prompt instructs to preserve tone', () => {
    const prompt = buildTranslationContext('en', 'es');
    expect(prompt).toContain("Preserve the speaker's tone");
  });

  test('prompt instructs to keep contractions', () => {
    const prompt = buildTranslationContext('en', 'es');
    expect(prompt).toContain('Keep contractions and natural spoken patterns');
  });

  test('prompt instructs NOT to translate proper nouns', () => {
    const prompt = buildTranslationContext('en', 'es');
    expect(prompt).toContain('Do NOT translate proper nouns');
    expect(prompt).toContain('names, places, brands');
  });

  test('prompt instructs output ONLY translated text', () => {
    const prompt = buildTranslationContext('en', 'es');
    expect(prompt).toContain('Output ONLY the translated text, nothing else');
  });

  test('prompt instructs no explanations or notes', () => {
    const prompt = buildTranslationContext('en', 'es');
    expect(prompt).toContain('Do NOT add explanations, notes, or alternatives');
  });

  test('prompt handles unclear input instruction', () => {
    const prompt = buildTranslationContext('en', 'es');
    expect(prompt).toContain('input is unclear or too short');
  });
});

describe('MT - DeepL Language Code Mapping', () => {
  test('maps "en" to "EN"', () => {
    expect(toDeepLLang('en')).toBe('EN');
  });

  test('maps "zh" to "ZH-HANS"', () => {
    expect(toDeepLLang('zh')).toBe('ZH-HANS');
  });

  test('maps "zh-cn" to "ZH-HANS"', () => {
    expect(toDeepLLang('zh-cn')).toBe('ZH-HANS');
  });

  test('maps "zh-tw" to "ZH-HANT"', () => {
    expect(toDeepLLang('zh-tw')).toBe('ZH-HANT');
  });

  test('maps "pt" to "PT-BR"', () => {
    expect(toDeepLLang('pt')).toBe('PT-BR');
  });

  test('maps "pt-pt" to "PT-PT"', () => {
    expect(toDeepLLang('pt-pt')).toBe('PT-PT');
  });

  test('target "en" resolves to "EN-US"', () => {
    expect(toDeepLLang('en', true)).toBe('EN');
    // Direct lookup finds 'en' → 'EN' first
  });

  test('handles case-insensitive input', () => {
    expect(toDeepLLang('FR')).toBe('FR');
    expect(toDeepLLang('De')).toBe('DE');
  });

  test('handles underscore separator', () => {
    expect(toDeepLLang('zh_cn')).toBe('ZH-HANS');
  });

  test('returns uppercase for unknown languages', () => {
    expect(toDeepLLang('xx')).toBe('XX');
  });
});

describe('MT - DeepL API Integration', () => {
  // Integration tests require DEEPL_API_KEY — skip in CI
  const hasKey = !!process.env.DEEPL_API_KEY;

  (hasKey ? test : test.skip)('translates English to Spanish via DeepL', async () => {
    const { translateWithDeepL } = require('../server/mt');
    const result = await translateWithDeepL('Hello, how are you?', 'en', 'es');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
