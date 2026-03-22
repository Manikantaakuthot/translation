import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { conversationsApi, messagesApi, usersApi } from '../api/client';
import { useAuthStore } from './authStore';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  type: string;
  content: string;
  mediaUrl?: string;
  replyToMessageId?: string;
  replyToMessage?: { id: string; content: string; type: string; mediaUrl?: string; senderName?: string; isDeleted?: boolean };
  status?: { sent?: string; delivered?: any[]; read?: any[] };
  reactions?: Record<string, string>;
  isDeleted?: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
  createdAt: string;
  // New fields
  linkPreview?: { url: string; title: string; description: string; image?: string } | null;
  isEdited?: boolean;
  editedAt?: string;
  expiresAt?: string;
  isViewOnce?: boolean;
  viewedBy?: string[];
  mentions?: string[];
  sharedContact?: { name: string; phone: string; email?: string; avatar?: string } | null;
  poll?: { question: string; options: { text: string; voters: string[] }[]; allowMultiple: boolean } | null;
  location?: { latitude: number; longitude: number; name?: string; address?: string; isLive?: boolean; liveDuration?: number; expiresAt?: string; updatedAt?: string } | null;
  failedToSend?: boolean;
}

export interface Conversation {
  id: string;
  type: string;
  participants: { userId: string; name?: string; profilePictureUrl?: string; isOnline?: boolean }[];
  name?: string;
  updatedAt: string;
  isMuted?: boolean;
  isArchived?: boolean;
  lastMessage?: { id: string; content: string; type: string; mediaUrl?: string; senderName?: string; createdAt: string; isDeleted?: boolean };
  unreadCount?: number;
}

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  selectedConversationId: string | null;
  replyMessage: Message | null;
  typingUsers: Record<string, string[]>;
  isLoading: boolean;
  socketConnected: boolean;
  highlightedMessageId: string | null;
  setHighlightedMessageId: (id: string | null) => void;
  setSocketConnected: (connected: boolean) => void;
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, options?: { type?: string; mediaUrl?: string; replyToMessageId?: string; poll?: any; location?: any }) => Promise<Message | null>;
  selectConversation: (id: string | null) => void;
  setReplyMessage: (message: Message | null) => void;
  addMessage: (message: Message) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  markMessagesRead: (conversationId: string, messageIds: string[]) => void;
  updateMessageRead: (conversationId: string, messageIds: string[], userId: string) => void;
  deleteMessage: (messageId: string, conversationId: string) => void;
  deleteMessageForMe: (messageId: string, conversationId: string) => void;
  updateMessageDelivered: (conversationId: string, messageId: string, userId: string) => void;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void;
  updateParticipantOnline: (userId: string, isOnline: boolean) => void;
  forwardMessage: (messageId: string, conversationId: string) => Promise<Message | null>;
  starMessage: (messageId: string, conversationId: string, starred: boolean) => Promise<void>;
  pinMessage: (messageId: string, conversationId: string, pinned: boolean) => Promise<void>;
  editMessage: (messageId: string, conversationId: string, content: string) => Promise<void>;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
  (set, get) => ({
  conversations: [],
  messages: {},
  selectedConversationId: null,
  replyMessage: null,
  typingUsers: {},
  isLoading: false,
  socketConnected: false,
  highlightedMessageId: null,
  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),
  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setReplyMessage: (message) => set({ replyMessage: message }),
  loadConversations: async () => {
    set({ isLoading: true });
    try {
      const { data } = await conversationsApi.list();
      const list = Array.isArray(data) ? data : [];
      // If user is currently viewing a conversation, keep its unreadCount at 0
      // (the API may return a stale count before the read receipt is processed)
      const selectedId = get().selectedConversationId;
      const adjusted = selectedId
        ? list.map((c: Conversation) => c.id === selectedId ? { ...c, unreadCount: 0 } : c)
        : list;
      set({ conversations: adjusted, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  loadMessages: async (conversationId) => {
    set({ isLoading: true });
    try {
      const { data } = await messagesApi.list(conversationId);
      const list = Array.isArray(data) ? data : [];
      set((s) => {
        // Merge: keep any messages that arrived via socket but aren't in the API response yet
        const existing = s.messages[conversationId] || [];
        const apiIds = new Set(list.map((m: any) => m.id));
        const socketOnly = existing.filter((m) => !apiIds.has(m.id));
        const merged = [...list, ...socketOnly];
        return {
          messages: { ...s.messages, [conversationId]: merged },
          isLoading: false,
        };
      });
    } catch (err) {
      console.error('[ChatStore] Failed to load messages:', err);
      set({ isLoading: false });
    }
  },
  sendMessage: async (conversationId, content, options = {}) => {
    const type = options.type || 'text';
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const currentUser = useAuthStore.getState().user;

    // 1. Create optimistic message so sender sees it immediately
    const optimistic: Message = {
      id: tempId,
      conversationId,
      senderId: currentUser?.id || '',
      senderName: currentUser?.name,
      type,
      content: content || '',
      mediaUrl: options.mediaUrl,
      replyToMessageId: options.replyToMessageId,
      poll: options.poll || null,
      location: options.location ? {
        ...options.location,
        ...(options.location.isLive && options.location.liveDuration ? {
          expiresAt: new Date(Date.now() + options.location.liveDuration * 60000).toISOString(),
          updatedAt: new Date().toISOString(),
        } : {}),
      } : null,
      status: { sent: new Date().toISOString() },
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: [...(s.messages[conversationId] || []), optimistic],
      },
    }));

    try {
      // 2. Send to API
      const payload: any = {
        type,
        content: content || '',
        mediaUrl: options.mediaUrl,
        replyToMessageId: options.replyToMessageId,
      };
      if (options.poll) payload.poll = options.poll;
      if (options.location) payload.location = options.location;
      const { data } = await messagesApi.send(conversationId, payload);

      // 3. Replace optimistic message with real API response
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] || []).map((m) =>
            m.id === tempId ? data : m
          ),
        },
      }));

      return data;
    } catch (err) {
      console.error('[ChatStore] Failed to send message:', err);
      // Mark optimistic message as failed (keep visible so user can retry)
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] || []).map((m) =>
            m.id === tempId ? { ...m, failedToSend: true } : m
          ),
        },
      }));
      return null;
    }
  },
  selectConversation: (id) => set({ selectedConversationId: id }),
  addMessage: (message) => {
    const convId = message.conversationId;
    set((s) => {
      const existing = s.messages[convId] || [];
      if (existing.some((m) => m.id === message.id)) return s;
      return {
        messages: {
          ...s.messages,
          [convId]: [...existing, message],
        },
      };
    });
  },
  setTyping: (conversationId, userId, isTyping) => {
    set((s) => {
      const current = s.typingUsers[conversationId] || [];
      const next = isTyping
        ? current.includes(userId) ? current : [...current, userId]
        : current.filter((id) => id !== userId);
      return {
        typingUsers: { ...s.typingUsers, [conversationId]: next },
      };
    });
  },
  markMessagesRead: (conversationId, messageIds) => {
    if (messageIds.length === 0) return;
    messagesApi.markRead(messageIds, conversationId);
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          messageIds.includes(m.id)
            ? {
                ...m,
                status: {
                  ...m.status,
                  read: m.status?.read?.length
                    ? m.status.read
                    : [{ userId: useAuthStore.getState().user?.id || '', at: new Date().toISOString() }],
                },
              }
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
            ? {
                ...m,
                status: {
                  ...m.status,
                  read: [...(m.status?.read || []), { userId, at: new Date().toISOString() }],
                },
              }
            : m
        ),
      },
    }));
  },
  deleteMessage: (messageId, conversationId) => {
    // Delete for everyone — keep bubble but mark as deleted
    set((s) => {
      const updatedMessages = (s.messages[conversationId] || [])
        .map((m) =>
          m.id === messageId
            ? { ...m, isDeleted: true, mediaUrl: undefined }
            : m
        )
        // Also update any replies that reference the deleted message
        .map((m) =>
          m.replyToMessage?.id === messageId
            ? { ...m, replyToMessage: { ...m.replyToMessage, content: 'This message was deleted', isDeleted: true } }
            : m
        );

      return {
        messages: {
          ...s.messages,
          [conversationId]: updatedMessages,
        },
        // Update conversation list preview if the deleted message was the last message
        conversations: s.conversations.map((c) =>
          c.id === conversationId && c.lastMessage?.id === messageId
            ? { ...c, lastMessage: { ...c.lastMessage, content: '🚫 This message was deleted', isDeleted: true } }
            : c
        ),
      };
    });
  },
  deleteMessageForMe: (messageId, conversationId) => {
    // Delete for me — remove from local array entirely
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).filter((m) => m.id !== messageId),
      },
    }));
  },
  updateMessageDelivered: (conversationId, messageId, userId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          m.id === messageId
            ? {
                ...m,
                status: {
                  ...m.status,
                  delivered: [...(m.status?.delivered || []), { userId }],
                },
              }
            : m
        ),
      },
    }));
  },
  updateConversation: (conversationId, updates) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, ...updates } : c
      ),
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
  forwardMessage: async (messageId, targetConversationId) => {
    try {
      const { data } = await messagesApi.forward(messageId, targetConversationId);
      set((s) => ({
        messages: {
          ...s.messages,
          [targetConversationId]: [...(s.messages[targetConversationId] || []), data],
        },
      }));
      return data;
    } catch {
      return null;
    }
  },
  starMessage: async (messageId, conversationId, starred) => {
    try {
      await messagesApi.star(messageId, starred);
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] || []).map((m) =>
            m.id === messageId ? { ...m, isStarred: starred } : m
          ),
        },
      }));
    } catch (err) {
      console.error('[ChatStore] Failed to star message:', err);
    }
  },
  pinMessage: async (messageId, conversationId, pinned) => {
    try {
      await messagesApi.pin(messageId, pinned);
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] || []).map((m) =>
            m.id === messageId ? { ...m, isPinned: pinned } : m
          ),
        },
      }));
    } catch (err) {
      console.error('[ChatStore] Failed to pin message:', err);
    }
  },
  editMessage: async (messageId, conversationId, content) => {
    try {
      await messagesApi.edit(messageId, content);
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] || []).map((m) =>
            m.id === messageId ? { ...m, content, isEdited: true, editedAt: new Date().toISOString() } : m
          ),
        },
      }));
    } catch (err) {
      console.error('[ChatStore] Failed to edit message:', err);
      throw err;
    }
  },
  updateMessage: (conversationId, messageId, updates) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    }));
  },
}),
  {
    name: 'chat-store',
    storage: createJSONStorage(() => localStorage),
    // Only persist conversations and messages — not transient UI state
    partialize: (s) => ({
      conversations: s.conversations,
      messages: s.messages,
      selectedConversationId: s.selectedConversationId,
    }),
  },
));
