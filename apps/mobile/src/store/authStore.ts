import { create } from 'zustand';
import { storage } from '../utils/storage';
import { authApi } from '../api/client';

interface User {
  id: string;
  phone: string;
  name: string;
  profilePictureUrl?: string;
  countryCode: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  hydrated: boolean;
  login: (phone: string, password: string, fcmToken?: string) => Promise<void>;
  register: (name: string, phone: string, countryCode: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const [accessToken, refreshToken, userJson] = await Promise.all([
        storage.getItem('accessToken'),
        storage.getItem('refreshToken'),
        storage.getItem('user'),
      ]);
      const user = userJson ? JSON.parse(userJson) : null;
      set({ accessToken, refreshToken, user, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  login: async (phone, password, fcmToken) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.login(phone, password, fcmToken);
      await Promise.all([
        storage.setItem('accessToken', data.accessToken),
        storage.setItem('refreshToken', data.refreshToken),
        storage.setItem('user', JSON.stringify(data.user)),
      ]);
      set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (name, phone, countryCode, password) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.register(name, phone, countryCode, password);
      await Promise.all([
        storage.setItem('accessToken', data.accessToken),
        storage.setItem('refreshToken', data.refreshToken),
        storage.setItem('user', JSON.stringify(data.user)),
      ]);
      set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    const { refreshToken } = get();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {}
    await Promise.all([
      storage.deleteItem('accessToken'),
      storage.deleteItem('refreshToken'),
      storage.deleteItem('user'),
      storage.deleteItem('lastOnline'),
    ]);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  setUser: (user) => set({ user }),
}));
