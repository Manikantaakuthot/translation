import axios from 'axios';

// ── Token getter for multi-tab safety ──
// Instead of reading localStorage (shared across tabs), the auth store registers
// a getter so each tab uses its own in-memory Zustand token.
let getAccessToken: (() => string | null) | null = null;
export function setTokenGetter(fn: () => string | null) {
  getAccessToken = fn;
}

// Use relative /api when on localhost (Vite proxy works); use host IP for remote devices
function getApiUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  // In dev mode, always use /api — Vite proxy handles it (avoids mixed-content on HTTPS)
  if (import.meta.env.DEV) return '/api';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api';
  // Remote device (LAN IP, tunnel, etc.): connect directly to API on the same host
  return `http://${host}:3000/api`;
}
const API_URL = getApiUrl();

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  // Prefer in-memory store token (tab-safe) over localStorage (shared across tabs)
  const token = getAccessToken
    ? getAccessToken()
    : sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: any) => void }> = [];

const processQueue = (token: string | null, err: any = null) => {
  failedQueue.forEach((p) => (err ? p.reject(err) : p.resolve(token!)));
  failedQueue = [];
};

// Auth endpoints that should NOT trigger token refresh or redirect
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/send-otp', '/auth/verify-otp', '/auth/login-totp'];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthEndpoint = AUTH_PATHS.some((p) => original.url?.includes(p));

    // Don't intercept 401s from auth endpoints - let the component handle them
    if (isAuthEndpoint) {
      return Promise.reject(err);
    }

    if (err.response?.status === 401 && !original._retry) {
      const refreshToken = sessionStorage.getItem('refreshToken') || localStorage.getItem('refreshToken');
      if (!refreshToken) {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(err);
      }
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve: (t) => { original.headers.Authorization = `Bearer ${t}`; resolve(api(original)); }, reject });
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const { data } = await api.post('/auth/refresh', { refreshToken });
        // Keep auth scoped per tab/session to support multiple concurrent accounts.
        sessionStorage.setItem('accessToken', data.accessToken);
        if (data.refreshToken) sessionStorage.setItem('refreshToken', data.refreshToken);
        processQueue(data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(null, refreshErr);
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  register: (data: { phone: string; countryCode: string; name: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { phone: string; password: string }) => api.post('/auth/login', data),
  loginTotp: (data: { phone: string; password: string; totpCode: string }) =>
    api.post('/auth/login-totp', data),
  sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (data: { phone: string; otp: string; name?: string; countryCode?: string }) =>
    api.post('/auth/verify-otp', data),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  logout: () => api.post('/auth/logout'),
  setup2fa: () => api.post('/auth/2fa/setup'),
  enable2fa: (code: string) => api.post('/auth/2fa/enable', { code }),
  disable2fa: (code: string) => api.post('/auth/2fa/disable', { code }),
  forgotPassword: (phone: string) => api.post('/auth/forgot-password', { phone }),
  verifyResetOtp: (phone: string, otp: string) => api.post('/auth/verify-reset-otp', { phone, otp }),
  resetPassword: (resetToken: string, newPassword: string) =>
    api.post('/auth/reset-password', { resetToken, newPassword }),
};

export const usersApi = {
  me: () => api.get('/users/me'),
  updateMe: (data: { name?: string; statusText?: string; profilePictureUrl?: string }) => api.put('/users/me', data),
  exportData: () => api.get('/users/me/export'),
  deleteAccount: () => api.delete('/users/me'),
  search: (q: string) => api.get('/users/search', { params: { q } }),
  getContacts: () => api.get('/users/contacts'),
  addContact: (id: string, displayName?: string) => api.post(`/users/contacts/${id}`, { displayName }),
  removeContact: (id: string) => api.delete(`/users/contacts/${id}`),
  getById: (id: string) => api.get(`/users/${id}`),
  createByPhone: (phone: string, name: string, countryCode?: string) =>
    api.post('/users/create-by-phone', { phone, name, countryCode }),
  blockContact: (id: string) => api.post(`/users/contacts/${id}/block`),
  unblockContact: (id: string) => api.post(`/users/contacts/${id}/unblock`),
  getCommonGroups: (id: string) => api.get(`/users/${id}/common-groups`),
  updatePrivacy: (data: Record<string, any>) => api.put('/users/me/privacy', data),
  updateNotifications: (data: Record<string, any>) => api.put('/users/me/notifications', data),
  syncContacts: (phones: string[]) => api.post('/users/contacts/sync', { phones }),
};

export const conversationsApi = {
  list: () => api.get('/conversations'),
  get: (id: string) => api.get(`/conversations/${id}`),
  create: (data: { type: 'direct' | 'group'; participantIds: string[]; name?: string }) =>
    api.post('/conversations', data),
  getOrCreateDirect: (userId: string) => api.post(`/conversations/direct/${userId}`),
  mute: (id: string, muted: boolean) => api.put(`/conversations/${id}/mute`, { muted }),
  archive: (id: string, archived: boolean) => api.post(`/conversations/${id}/archive`, { archived }),
};

export const webrtcApi = {
  getConfig: () => api.get('/webrtc/config'),
};

export const messagesApi = {
  search: (q: string, limit?: number) => api.get('/messages/search', { params: { q, limit } }),
  list: (conversationId: string, params?: { limit?: number; before?: string }) =>
    api.get(`/conversations/${conversationId}/messages`, { params }),
  send: (conversationId: string, data: { type: string; content?: string; mediaUrl?: string; replyToMessageId?: string; isViewOnce?: boolean; mentions?: string[]; sharedContact?: any; poll?: any; location?: any }) =>
    api.post(`/conversations/${conversationId}/messages`, { conversationId, ...data }),
  markRead: (messageIds: string[], conversationId?: string) =>
    api.post('/messages/read', { messageIds, conversationId }).catch(() => {}),
  forward: (messageId: string, conversationId: string) =>
    api.post(`/messages/${messageId}/forward`, { conversationId }),
  delete: (id: string, deleteForEveryone = false) =>
    api.delete(`/messages/${id}`, {
      params: { deleteForEveryone: deleteForEveryone ? 'true' : 'false' },
      data: { deleteForEveryone },
    }),
  getMedia: (conversationId: string, limit?: number) =>
    api.get(`/messages/conversation/${conversationId}/media`, { params: { limit } }),
  star: (id: string, starred: boolean) => api.patch(`/messages/${id}/star`, { starred }),
  pin: (id: string, pinned: boolean) => api.patch(`/messages/${id}/pin`, { pinned }),
  getStarred: () => api.get('/messages/starred'),
  getPinned: (conversationId: string) => api.get(`/messages/conversation/${conversationId}/pinned`),
  addReaction: (id: string, emoji: string) => api.post(`/messages/${id}/reactions`, { emoji }),
  edit: (id: string, content: string) => api.patch(`/messages/${id}`, { content }),
  markViewOnce: (id: string) => api.post(`/messages/${id}/view-once`),
  setDisappearing: (conversationId: string, duration: number) =>
    api.patch(`/messages/conversation/${conversationId}/disappearing`, { duration }),
  votePoll: (messageId: string, optionIndex: number) =>
    api.post(`/messages/${messageId}/poll/vote`, { optionIndex }),
  translate: (messageId: string, targetLanguage: string) =>
    api.post(`/messages/${messageId}/translate`, { targetLanguage }),
  getUnreadSince: (since?: string, limit?: number) =>
    api.get('/messages/unread-since', { params: { since, limit } }),
};

export const mediaApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const groupsApi = {
  get: (id: string) => api.get(`/groups/${id}`),
  update: (id: string, data: { name?: string; description?: string; iconUrl?: string }) => api.put(`/groups/${id}`, data),
  addMember: (id: string, userId: string) => api.post(`/groups/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => api.delete(`/groups/${id}/members/${userId}`),
  setAdmin: (id: string, userId: string, isAdmin: boolean) => api.put(`/groups/${id}/admins`, { userId, isAdmin }),
  leave: (id: string) => api.delete(`/groups/${id}/leave`),
  generateInviteLink: (id: string) => api.post(`/groups/${id}/invite`),
  revokeInviteLink: (id: string) => api.delete(`/groups/${id}/invite`),
  toggleInviteLink: (id: string, enabled: boolean) => api.post(`/groups/${id}/invite/toggle`, { enabled }),
  getByInviteCode: (code: string) => api.get(`/groups/invite/${code}`),
  joinByInviteCode: (code: string) => api.post(`/groups/join/${code}`),
};

export const callsApi = {
  initiate: (calleeId: string, type: 'voice' | 'video') => api.post('/calls/initiate', { calleeId, type }),
  answer: (callId: string) => api.post(`/calls/${callId}/answer`),
  reject: (callId: string) => api.post(`/calls/${callId}/reject`),
  end: (callId: string) => api.post(`/calls/${callId}/end`),
  history: (limit?: number) => api.get('/calls/history', { params: { limit } }),
};

export const pushApi = {
  subscribe: (data: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; fcmToken?: string }) =>
    api.post('/push/subscribe', data),
};

export const translationApi = {
  translate: (text: string, targetLanguage: string, sourceLanguage?: string) =>
    api.post('/translation/translate', { text, targetLanguage, sourceLanguage }),
  detect: (text: string) => api.post('/translation/detect', { text }),
  getSupportedLanguages: () => api.get('/translation/languages'),
  tts: (text: string, language: string) =>
    api.post('/translation/tts', { text, language }, { responseType: 'blob' }),
};

export const gifApi = {
  search: (q: string, limit?: number) => api.get('/gif/search', { params: { q, limit } }),
  trending: (limit?: number) => api.get('/gif/trending', { params: { limit } }),
};

export const stickersApi = {
  getPacks: (search?: string) => api.get('/stickers/packs', { params: { search } }),
  getDefaultPacks: () => api.get('/stickers/packs/default'),
  getPack: (id: string) => api.get(`/stickers/packs/${id}`),
  createPack: (data: any) => api.post('/stickers/packs', data),
  deletePack: (id: string) => api.delete(`/stickers/packs/${id}`),
};

export const channelsApi = {
  create: (data: { name: string; description?: string }) => api.post('/channels', data),
  list: () => api.get('/channels'),
  discover: (q?: string, limit?: number) => api.get('/channels/discover', { params: { q, limit } }),
  get: (id: string) => api.get(`/channels/${id}`),
  update: (id: string, data: { name?: string; description?: string }) => api.put(`/channels/${id}`, data),
  subscribe: (id: string) => api.post(`/channels/${id}/subscribe`),
  unsubscribe: (id: string) => api.delete(`/channels/${id}/subscribe`),
  postMessage: (id: string, data: { content: string; type?: string; mediaUrl?: string }) => api.post(`/channels/${id}/messages`, data),
  getMessages: (id: string, limit?: number, before?: string) => api.get(`/channels/${id}/messages`, { params: { limit, before } }),
  delete: (id: string) => api.delete(`/channels/${id}`),
};

export const statusApi = {
  create: (data: { type: 'text' | 'image' | 'video'; content?: string; mediaUrl?: string; backgroundColor?: string }) =>
    api.post('/status', data),
  feed: () => api.get('/status/feed'),
  markViewed: (id: string) => api.post(`/status/${id}/view`),
  delete: (id: string) => api.delete(`/status/${id}`),
};
