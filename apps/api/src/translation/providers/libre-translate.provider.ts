import { Injectable } from '@nestjs/common';
import * as https from 'https';

export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: string;
  provider: string;
}

/** DeepL language code mapping */
const DEEPL_LANG_MAP: Record<string, string> = {
  en: 'EN', es: 'ES', fr: 'FR', de: 'DE', hi: 'HI',
  zh: 'ZH-HANS', ja: 'JA', ar: 'AR', pt: 'PT-BR', ru: 'RU',
  ko: 'KO', it: 'IT', nl: 'NL', pl: 'PL', tr: 'TR',
  uk: 'UK', vi: 'VI', id: 'ID', sv: 'SV', da: 'DA',
  fi: 'FI', el: 'EL', cs: 'CS', ro: 'RO', hu: 'HU',
  bg: 'BG', sk: 'SK', lt: 'LT', lv: 'LV', et: 'ET', sl: 'SL',
};

@Injectable()
export class LibreTranslateProvider {
  // Language code → full name (needed for LLM translation prompts)
  private static readonly LANG_NAMES: Record<string, string> = {
    te: 'Telugu', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada',
    ml: 'Malayalam', bn: 'Bengali', es: 'Spanish', fr: 'French',
    de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic',
    tr: 'Turkish', vi: 'Vietnamese', th: 'Thai', en: 'English',
    gu: 'Gujarati', mr: 'Marathi', or: 'Odia', pa: 'Punjabi',
  };

  /**
   * Translate text using NVIDIA NIM LLM (primary, most accurate),
   * Google Translate free endpoint (secondary), MyMemory (fallback).
   */
  async translate(
    text: string,
    target: string,
    source?: string,
  ): Promise<TranslationResult> {
    const srcLang = source && source !== 'auto' && source !== 'unknown' ? source : 'auto';

    // If source and target are the same known language, skip the API call
    if (srcLang !== 'auto' && srcLang === target) {
      return {
        translatedText: text,
        detectedSourceLanguage: srcLang,
        provider: 'passthrough',
      };
    }

    // 1. Try DeepL first (highest fluency for spoken dialogue)
    if (process.env.DEEPL_API_KEY) {
      try {
        return await this.deeplTranslate(text, target, srcLang);
      } catch (err: any) {
        console.warn(`[Translation] DeepL failed, falling back to NVIDIA NIM:`, err.message);
      }
    }

    // 2. Try NVIDIA NIM LLM (best accuracy for languages DeepL doesn't support)
    if (process.env.NVIDIA_NIM_API_KEY) {
      try {
        return await this.nvidiaTranslate(text, target, srcLang);
      } catch (err: any) {
        console.warn(`[Translation] NVIDIA NIM failed, falling back to Google:`, err.message);
      }
    }

    // 3. Try Google Translate with retry
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.googleTranslate(text, target, srcLang);
      } catch (err: any) {
        const isRetryable = err.message?.includes('429') || err.message?.includes('503');
        if (isRetryable && attempt === 0) {
          console.warn(`[Translation] Google Translate rate limited, retrying in 500ms...`);
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        console.warn(`[Translation] Google Translate failed, falling back to MyMemory:`, err.message);
        break;
      }
    }

    // 4. Fallback: MyMemory
    return this.myMemoryTranslate(text, target, srcLang);
  }

  /** Google Translate free endpoint — excellent quality for all languages */
  private async googleTranslate(
    text: string,
    target: string,
    source: string,
  ): Promise<TranslationResult> {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t`;
    const body = `q=${encodeURIComponent(text)}`;

    const data = await this.postForm(url, body);

    // Google returns array: [[["translated text","original text",null,null,x],...],null,"detected_lang"]
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Unexpected Google Translate response format');
    }

    // Concatenate all translated segments
    let translated = '';
    for (const segment of data[0]) {
      if (Array.isArray(segment) && segment[0]) {
        translated += segment[0];
      }
    }

    if (!translated.trim()) {
      throw new Error('Google Translate returned empty result');
    }

    const detectedSrc = data[2] || source;
    console.log(`[Translation] Google: "${text}" → "${translated}" (${source}→${target})`);

    return {
      translatedText: translated,
      detectedSourceLanguage: detectedSrc,
      provider: 'google',
    };
  }

  /** DeepL API — highest fluency for spoken dialogue translation */
  private async deeplTranslate(
    text: string,
    target: string,
    source: string,
  ): Promise<TranslationResult> {
    const apiKey = process.env.DEEPL_API_KEY;
    if (!apiKey) throw new Error('DEEPL_API_KEY not set');

    // Map to DeepL language codes
    const toDeepL = (lang: string, isTarget = false): string | undefined => {
      const normalized = lang.toLowerCase().replace('_', '-');
      const base = normalized.split('-')[0];
      if (DEEPL_LANG_MAP[normalized]) return DEEPL_LANG_MAP[normalized];
      if (DEEPL_LANG_MAP[base]) return DEEPL_LANG_MAP[base];
      if (isTarget && base === 'en') return 'EN-US';
      return undefined; // Language not supported by DeepL
    };

    const targetDeepL = toDeepL(target, true);
    if (!targetDeepL) {
      throw new Error(`DeepL does not support target language: ${target}`);
    }

    // DeepL free keys end with ':fx'
    const baseUrl = apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2'
      : 'https://api.deepl.com/v2';

    const targetName = LibreTranslateProvider.LANG_NAMES[target] || target;
    const sourceName = source !== 'auto' ? (LibreTranslateProvider.LANG_NAMES[source] || source) : 'the source language';

    const body: any = {
      text: [text],
      target_lang: targetDeepL,
      context: `You are a professional real-time spoken language interpreter. Translate spoken dialogue from ${sourceName} to ${targetName}. Preserve tone, contractions, and natural speech patterns. Do NOT translate proper nouns.`,
      preserve_formatting: true,
    };

    if (source !== 'auto') {
      const sourceDeepL = toDeepL(source);
      if (sourceDeepL) body.source_lang = sourceDeepL;
    }

    const response = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepL API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const translations = data?.translations;
    if (!translations || translations.length === 0 || !translations[0].text?.trim()) {
      throw new Error('DeepL returned empty translation');
    }

    const translated = translations[0].text;
    const detectedSrc = translations[0].detected_source_language?.toLowerCase() || source;
    console.log(`[Translation] DeepL: "${text}" → "${translated}" (${source}→${target})`);

    return {
      translatedText: translated,
      detectedSourceLanguage: detectedSrc,
      provider: 'deepl',
    };
  }

  /** NVIDIA NIM LLM — most accurate translation using large language models */
  private async nvidiaTranslate(
    text: string,
    target: string,
    source: string,
  ): Promise<TranslationResult> {
    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    if (!apiKey) throw new Error('NVIDIA_NIM_API_KEY not set');

    const targetName = LibreTranslateProvider.LANG_NAMES[target] || target;
    const sourceName = source !== 'auto'
      ? (LibreTranslateProvider.LANG_NAMES[source] || source)
      : null;

    const sourceHint = sourceName ? ` from ${sourceName}` : '';
    const systemPrompt = `You are a professional translator. Translate the following text${sourceHint} to ${targetName}. Return ONLY the translated text, nothing else. No explanations, no quotes, no prefixes.`;

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA NIM API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    // Nemotron Ultra puts output in reasoning_content (thinking mode), not content
    const message = data.choices?.[0]?.message;
    const translated = (message?.content || message?.reasoning_content || '').trim();

    if (!translated) {
      console.error('[Translation] NVIDIA NIM response:', JSON.stringify(data.choices?.[0]?.message));
      throw new Error('NVIDIA NIM returned empty translation');
    }

    // Clean up: remove any thinking/reasoning prefixes the LLM might add
    const cleaned = translated
      .replace(/^(Translation|Here is the translation|Translated text|Output):\s*/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    console.log(`[Translation] NVIDIA: "${text}" → "${cleaned}" (${source}→${target})`);

    return {
      translatedText: cleaned,
      detectedSourceLanguage: source,
      provider: 'nvidia-nim',
    };
  }

  /** MyMemory fallback */
  private async myMemoryTranslate(
    text: string,
    target: string,
    source: string,
  ): Promise<TranslationResult> {
    const srcLang = source === 'auto' ? 'Autodetect' : source;
    const langpair = `${srcLang}|${target}`;
    const url = `https://api.mymemory.translated.net/get`;
    const body = `q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;

    const data = await this.postForm(url, body);

    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText;
      if (!translated.trim()) {
        throw new Error('MyMemory returned empty translation');
      }
      const detectedSrc = data.responseData.match?.source || srcLang;
      console.log(`[Translation] MyMemory: "${text}" → "${translated}" (${target})`);
      return {
        translatedText: translated,
        detectedSourceLanguage: detectedSrc,
        provider: 'mymemory',
      };
    }

    throw new Error(data.responseDetails || 'MyMemory translation failed');
  }

  async detectLanguage(text: string): Promise<string> {
    try {
      // Use Google Translate's auto-detect via POST
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t`;
      const body = `q=${encodeURIComponent(text)}`;
      const data = await this.postForm(url, body);
      return data[2] || 'en';
    } catch {
      return 'en';
    }
  }

  getSupportedLanguages(): Array<{ code: string; name: string }> {
    return [
      { code: 'en', name: 'English' },
      { code: 'te', name: 'Telugu' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ta', name: 'Tamil' },
      { code: 'kn', name: 'Kannada' },
      { code: 'ml', name: 'Malayalam' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'ar', name: 'Arabic' },
      { code: 'bn', name: 'Bengali' },
      { code: 'tr', name: 'Turkish' },
      { code: 'vi', name: 'Vietnamese' },
      { code: 'th', name: 'Thai' },
    ];
  }

  /** POST with form-encoded body — avoids URL length limits */
  private postForm(url: string, formBody: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(formBody),
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            let errBody = '';
            res.on('data', (chunk) => (errBody += chunk));
            res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errBody}`)));
            return;
          }
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error('Invalid JSON response'));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(formBody);
      req.end();
    });
  }

  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      }).on('error', reject);
    });
  }
}
