import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi, usersApi, setTokenGetter } from '../api/client';
import { useTranslationStore } from './translationStore';
import { useChatStore } from './chatStore';

// Re-export for use in persist callback
let authStoreSet: ((partial: Partial<AuthState>) => void) | null = null;

export interface User {
  id: string;
  phone: string;
  countryCode: string;
  name: string;
  profilePictureUrl?: string;
  statusText?: string;
  lastSeen?: string;
  isOnline?: boolean;
  totpEnabled?: boolean;
  preferredLanguage?: string;
  autoTranslateMessages?: boolean;
  autoTranslateCalls?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  _hasHydrated: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (phone: string, countryCode: string, name: string, password: string) => Promise<void>;
  logout: () => void | Promise<void>;
  setUser: (user: User | null) => void;
  loadUser: () => Promise<void>;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => {
      authStoreSet = set;
      return {
      user: null,
      accessToken: null,
      isLoading: false,
      _hasHydrated: false,
      login: async (phone, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.login({ phone, password });
          // Clear previous user's cached chat data before switching users
          localStorage.removeItem('chat-store');
          useChatStore.setState({ conversations: [], messages: {}, selectedConversationId: null });
          // Keep auth token scoped to this tab/session so two accounts can run in parallel.
          sessionStorage.setItem('accessToken', data.accessToken);
          sessionStorage.setItem('refreshToken', data.refreshToken || '');
          set({ user: data.user, accessToken: data.accessToken, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },
      register: async (phone, countryCode, name, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.register({ phone, countryCode, name, password });
          // Clear any cached chat data from previous user session
          localStorage.removeItem('chat-store');
          useChatStore.setState({ conversations: [], messages: {}, selectedConversationId: null });
          // Keep auth token scoped to this tab/session so two accounts can run in parallel.
          sessionStorage.setItem('accessToken', data.accessToken);
          sessionStorage.setItem('refreshToken', data.refreshToken || '');
          set({ user: data.user, accessToken: data.accessToken, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },
      logout: async () => {
        try {
          await authApi.logout();
        } catch {}
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        // Clear cached chat data so next user doesn't see stale chats
        localStorage.removeItem('chat-store');
        useChatStore.setState({ conversations: [], messages: {}, selectedConversationId: null });
        set({ user: null, accessToken: null });
      },
      setUser: (user) => set({ user }),
      setHasHydrated: (v: boolean) => set({ _hasHydrated: v }),
      loadUser: async () => {
        const token = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
        if (!token) return;
        try {
          const { data } = await usersApi.me();
          set({ user: data, accessToken: token });
          useTranslationStore.getState().initFromUser(data);
        } catch (err: any) {
          // Only clear on 401 (invalid token), not on network errors
          if (err.response?.status === 401) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            set({ user: null, accessToken: null });
          }
        }
      },
    };
    },
    {
      name: 'auth',
      // Session-scoped persistence keeps each browser tab isolated (multi-account safe).
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ accessToken: s.accessToken, user: s.user }),
      onRehydrateStorage: () => () => {
        authStoreSet?.({ _hasHydrated: true });
      },
    }
  )
);

// Register token getter so axios reads the in-memory Zustand token (tab-safe)
setTokenGetter(() => useAuthStore.getState().accessToken);
