import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '../api/client';

export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'te', name: 'Telugu', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'hi', name: 'Hindi', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'ta', name: 'Tamil', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'kn', name: 'Kannada', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'ml', name: 'Malayalam', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'es', name: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'fr', name: 'French', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'de', name: 'German', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'zh', name: 'Chinese', flag: '\u{1F1E8}\u{1F1F3}' },
  { code: 'ja', name: 'Japanese', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'ko', name: 'Korean', flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'ar', name: 'Arabic', flag: '\u{1F1F8}\u{1F1E6}' },
  { code: 'ru', name: 'Russian', flag: '\u{1F1F7}\u{1F1FA}' },
];

interface TranslationState {
  preferredLanguage: string;
  autoTranslateMessages: boolean;
  autoTranslateCalls: boolean;
  messageTranslations: Record<string, string>;
  isTranslating: boolean;

  setPreferredLanguage: (lang: string) => void;
  setAutoTranslateMessages: (enabled: boolean) => void;
  setAutoTranslateCalls: (enabled: boolean) => void;
  saveLanguagePreferences: () => Promise<void>;
  translateMessage: (messageId: string, targetLang: string) => Promise<string>;
  clearTranslations: () => void;
  initFromUser: (user: any) => void;
}

export const useTranslationStore = create<TranslationState>()(
  persist(
  (set, get) => ({
  preferredLanguage: 'en',
  autoTranslateMessages: false,
  autoTranslateCalls: false,
  messageTranslations: {},
  isTranslating: false,

  setPreferredLanguage: (lang) => set({ preferredLanguage: lang }),
  setAutoTranslateMessages: (enabled) => set({ autoTranslateMessages: enabled }),
  setAutoTranslateCalls: (enabled) => set({ autoTranslateCalls: enabled }),

  saveLanguagePreferences: async () => {
    const { preferredLanguage, autoTranslateMessages, autoTranslateCalls } = get();
    try {
      await api.put('/users/me/language', {
        preferredLanguage,
        autoTranslateMessages,
        autoTranslateCalls,
      });
    } catch (err) {
      console.error('Failed to save language preferences:', err);
      throw err;
    }
  },

  translateMessage: async (messageId, targetLang) => {
    const { messageTranslations } = get();
    const cacheKey = `${messageId}:${targetLang}`;

    if (messageTranslations[cacheKey]) {
      return messageTranslations[cacheKey];
    }

    set({ isTranslating: true });
    try {
      const { data } = await api.post(`/messages/${messageId}/translate`, {
        targetLanguage: targetLang,
      });

      set((state) => ({
        messageTranslations: {
          ...state.messageTranslations,
          [cacheKey]: data.translatedText,
        },
        isTranslating: false,
      }));

      return data.translatedText;
    } catch (err) {
      set({ isTranslating: false });
      throw err;
    }
  },

  clearTranslations: () => set({ messageTranslations: {} }),

  initFromUser: (user: any) => {
    if (user?.preferredLanguage) {
      set({
        preferredLanguage: user.preferredLanguage,
        autoTranslateMessages: user.autoTranslateMessages || false,
        autoTranslateCalls: user.autoTranslateCalls || false,
      });
    }
  },
}),
  {
    name: 'translation-store',
    storage: createJSONStorage(() => localStorage),
    // Only persist language preferences — not transient state like isTranslating or cached translations
    partialize: (s) => ({
      preferredLanguage: s.preferredLanguage,
      autoTranslateMessages: s.autoTranslateMessages,
      autoTranslateCalls: s.autoTranslateCalls,
    }),
  },
));
