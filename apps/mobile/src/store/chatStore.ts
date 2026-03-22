import { create } from 'zustand';
import { conversationsApi, messagesApi } from '../api/client';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  type: string;
  content: string;
  mediaUrl?: string;
  replyToMessageId?: string;
  status?: { sent?: string; delivered?: { userId: string; at: string }[]; read?: { userId: string; at: string }[] };
  reactions?: Record<string, string>;
  isDeleted?: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: string;
  participants: { userId: string; name?: string; profilePictureUrl?: string; isOnline?: boolean }[];
  name?: string;
  updatedAt: string;
  lastMessage?: { content: string; type: string; createdAt: string };
  unreadCount?: number;
}

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  selectedConversationId: string | null;
  typingUsers: Record<string, string[]>;
  isLoading: boolean;
  // Actions
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  syncMissedMessages: (since: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, options?: { type?: string; mediaUrl?: string; replyToMessageId?: string }) => Promise<Message | null>;
  selectConversation: (id: string | null) => void;
  addMessage: (message: Message) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  markMessagesRead: (conversationId: string, messageIds: string[]) => void;
  updateMessageRead: (conversationId: string, messageIds: string[], userId: string) => void;
  updateMessageDelivered: (conversationId: string, messageId: string, userId: string) => void;
  deleteMessage: (messageId: string, conversationId: string) => void;
  updateParticipantOnline: (userId: string, isOnline: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  selectedConversationId: null,
  typingUsers: {},
  isLoading: false,

  loadConversations: async () => {
    set({ isLoading: true });
    try {
      const { data } = await conversationsApi.list();
      set({ conversations: Array.isArray(data) ? data : [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadMessages: async (conversationId) => {
    set({ isLoading: true });
    try {
      const { data } = await messagesApi.list(conversationId);
      const list: Message[] = Array.isArray(data) ? data : [];
      set((s) => {
        const existing = s.messages[conversationId] || [];
        const apiIds = new Set(list.map((m) => m.id));
        // Keep socket-only messages not yet in API response
        const socketOnly = existing.filter((m) => !apiIds.has(m.id));
        return {
          messages: { ...s.messages, [conversationId]: [...list, ...socketOnly] },
          isLoading: false,
        };
      });
    } catch {
      set({ isLoading: false });
    }
  },

  syncMissedMessages: async (since) => {
    try {
      const { data } = await messagesApi.getUnreadSince(since);
      const messages: Message[] = Array.isArray(data) ? data : [];
      if (!messages.length) return;

      set((s) => {
        const updated = { ...s.messages };
        for (const msg of messages) {
          const convId = msg.conversationId;
          const existing = updated[convId] || [];
          if (!existing.some((m) => m.id === msg.id)) {
            updated[convId] = [...existing, msg];
          }
        }
        return { messages: updated };
      });

      // Refresh conversation list to update last messages & unread counts
      get().loadConversations();
    } catch (err) {
      console.error('[ChatStore] syncMissedMessages failed:', err);
    }
  },

  sendMessage: async (conversationId, content, options = {}) => {
    try {
      const { data } = await messagesApi.send(conversationId, {
        type: options.type || 'text',
        content: content || '',
        mediaUrl: options.mediaUrl,
        replyToMessageId: options.replyToMessageId,
      });
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: [...(s.messages[conversationId] || []), data],
        },
      }));
      get().loadConversations();
      return data;
    } catch (err) {
      console.error('[ChatStore] sendMessage failed:', err);
      return null;
    }
  },

  selectConversation: (id) => set({ selectedConversationId: id }),

  addMessage: (message) => {
    set((s) => {
      const convId = message.conversationId;
      const existing = s.messages[convId] || [];
      if (existing.some((m) => m.id === message.id)) return s;
      return {
        messages: { ...s.messages, [convId]: [...existing, message] },
      };
    });
    // Refresh conversation list so sidebar stays up to date
    get().loadConversations();
  },

  setTyping: (conversationId, userId, isTyping) => {
    set((s) => {
      const current = s.typingUsers[conversationId] || [];
      const next = isTyping
        ? current.includes(userId) ? current : [...current, userId]
        : current.filter((id) => id !== userId);
      return { typingUsers: { ...s.typingUsers, [conversationId]: next } };
    });
  },

  markMessagesRead: (conversationId, messageIds) => {
    if (!messageIds.length) return;
    messagesApi.markRead(messageIds, conversationId).catch(() => {});
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          messageIds.includes(m.id)
            ? { ...m, status: { ...m.status, read: [...(m.status?.read || []), { userId: '__self__', at: new Date().toISOString() }] } }
            : m
        ),
      },
    }));
  },

  updateMessageRead: (conversationId, messageIds, userId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          messageIds.includes(m.id)
            ? { ...m, status: { ...m.status, read: [...(m.status?.read || []), { userId, at: new Date().toISOString() }] } }
            : m
        ),
      },
    }));
  },

  updateMessageDelivered: (conversationId, messageId, userId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          m.id === messageId
            ? { ...m, status: { ...m.status, delivered: [...(m.status?.delivered || []), { userId, at: new Date().toISOString() }] } }
            : m
        ),
      },
    }));
  },

  deleteMessage: (messageId, conversationId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m
        ),
      },
    }));
  },

  updateParticipantOnline: (userId, isOnline) => {
    set((s) => ({
      conversations: s.conversations.map((c) => ({
        ...c,
        participants: c.participants.map((p) =>
          p.userId === userId ? { ...p, isOnline } : p
        ),
      })),
    }));
  },
}));
