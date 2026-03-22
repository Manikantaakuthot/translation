import axios from 'axios';
import { storage } from '../utils/storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// Attach JWT to every request
api.interceptors.request.use(async (config) => {
  const token = await storage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await storage.getItem('refreshToken');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        await storage.setItem('accessToken', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        // Refresh failed — caller must redirect to login
      }
    }
    return Promise.reject(err);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (phone: string, password: string, fcmToken?: string) =>
    api.post('/auth/login', { phone, password, fcmToken, platform: 'android' }),
  register: (name: string, phone: string, countryCode: string, password: string) =>
    api.post('/auth/register', { name, phone, countryCode, password }),
  sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone: string, otp: string, name?: string, countryCode?: string) =>
    api.post('/auth/verify-otp', { phone, otp, name, countryCode }),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
};

// ── Conversations ─────────────────────────────────────────────────────────────
export const conversationsApi = {
  list: () => api.get('/conversations'),
  get: (id: string) => api.get(`/conversations/${id}`),
  create: (participantIds: string[], type = 'direct') =>
    api.post('/conversations', { participantIds, type }),
};

// ── Messages ──────────────────────────────────────────────────────────────────
export const messagesApi = {
  list: (conversationId: string, limit = 50, before?: string) =>
    api.get(`/conversations/${conversationId}/messages`, { params: { limit, before } }),
  send: (conversationId: string, body: { type: string; content?: string; mediaUrl?: string; replyToMessageId?: string }) =>
    api.post(`/conversations/${conversationId}/messages`, body),
  markRead: (messageIds: string[], conversationId?: string) =>
    api.post('/messages/read', { messageIds, conversationId }),
  getUnreadSince: (since: string) =>
    api.get('/messages/unread-since', { params: { since } }),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  me: () => api.get('/users/me'),
  search: (q: string) => api.get('/users/search', { params: { q } }),
  getById: (id: string) => api.get(`/users/${id}`),
};

// ── Contacts ──────────────────────────────────────────────────────────────────
export const contactsApi = {
  sync: (phones: string[]) => api.post('/users/contacts/sync', { phones }),
};

// ── Push ──────────────────────────────────────────────────────────────────────
export const pushApi = {
  subscribe: (fcmToken: string, platform = 'android') =>
    api.post('/push/subscribe', { fcmToken, platform }),
};
