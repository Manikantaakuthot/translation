import { create } from 'zustand';
import { channelsApi } from '../api/client';

export interface Channel {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  subscriberCount: number;
  isSubscribed?: boolean;
  createdAt: string;
  admins: string[];
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  content: string;
  type: string;
  mediaUrl?: string;
  createdAt: string;
  senderName?: string;
}

interface ChannelState {
  channels: Channel[];
  selectedChannelId: string | null;
  messages: Record<string, ChannelMessage[]>;
  loading: boolean;

  loadChannels: () => Promise<void>;
  selectChannel: (id: string | null) => void;
  loadMessages: (channelId: string) => Promise<void>;
  createChannel: (data: { name: string; description?: string }) => Promise<Channel | null>;
  subscribeChannel: (channelId: string) => Promise<void>;
  unsubscribeChannel: (channelId: string) => Promise<void>;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  selectedChannelId: null,
  messages: {},
  loading: false,

  loadChannels: async () => {
    set({ loading: true });
    try {
      const { data } = await channelsApi.list();
      set({ channels: Array.isArray(data) ? data : [] });
    } catch {
      set({ channels: [] });
    } finally {
      set({ loading: false });
    }
  },

  selectChannel: (id) => set({ selectedChannelId: id }),

  loadMessages: async (channelId) => {
    try {
      const { data } = await channelsApi.getMessages(channelId);
      set((s) => ({
        messages: { ...s.messages, [channelId]: Array.isArray(data) ? data : [] },
      }));
    } catch {
      // ignore
    }
  },

  createChannel: async (data) => {
    try {
      const { data: channel } = await channelsApi.create(data);
      set((s) => ({ channels: [channel, ...s.channels] }));
      return channel;
    } catch {
      return null;
    }
  },

  subscribeChannel: async (channelId) => {
    try {
      await channelsApi.subscribe(channelId);
      set((s) => ({
        channels: s.channels.map((c) =>
          c.id === channelId ? { ...c, isSubscribed: true, subscriberCount: c.subscriberCount + 1 } : c
        ),
      }));
    } catch {
      // ignore
    }
  },

  unsubscribeChannel: async (channelId) => {
    try {
      await channelsApi.unsubscribe(channelId);
      set((s) => ({
        channels: s.channels.map((c) =>
          c.id === channelId ? { ...c, isSubscribed: false, subscriberCount: Math.max(0, c.subscriberCount - 1) } : c
        ),
      }));
    } catch {
      // ignore
    }
  },
}));
