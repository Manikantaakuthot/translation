import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Hash, Send, Users, Bell, BellOff, Info, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useChannelStore, ChannelMessage } from '../store/channelStore';
import { channelsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function ChannelView() {
  const { id } = useParams<{ id: string }>();
  const { channels, messages: messageMap, loadMessages, subscribeChannel, unsubscribeChannel } = useChannelStore();
  const { user } = useAuthStore();

  const channel = channels.find((c) => c.id === id);
  const messages = id ? messageMap[id] || [] : [];

  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isAdmin = channel?.admins?.includes(user?.id || '') || false;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadMessages(id).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!newMessage.trim() || !id || !isAdmin) return;
    setSending(true);
    try {
      await channelsApi.postMessage(id, { content: newMessage.trim() });
      setNewMessage('');
      await loadMessages(id);
    } finally {
      setSending(false);
    }
  };

  const handleToggleSubscription = async () => {
    if (!id) return;
    if (channel?.isSubscribed) {
      await unsubscribeChannel(id);
    } else {
      await subscribeChannel(id);
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) return format(date, 'HH:mm');
      return format(date, 'dd/MM/yyyy HH:mm');
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#ECE5DD] dark:bg-[#0B141A] h-full">
      {/* Header */}
      <div className="bg-[#128C7E] dark:bg-[#202C33] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link to="/channels" className="p-1.5 -ml-1.5 rounded-full hover:bg-white/15">
          <ArrowLeft size={22} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          {channel?.iconUrl ? (
            <img src={channel.iconUrl} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <Hash size={20} className="text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold text-sm truncate">{channel?.name || 'Channel'}</h2>
          <p className="text-white/60 text-xs">{channel?.subscriberCount || 0} subscribers</p>
        </div>
        <button
          onClick={handleToggleSubscription}
          className="p-2 rounded-full hover:bg-white/15 text-white"
          title={channel?.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
        >
          {channel?.isSubscribed ? <BellOff size={20} /> : <Bell size={20} />}
        </button>
      </div>

      {/* Channel description bar */}
      {channel?.description && (
        <div className="px-4 py-2 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-gray-200 dark:border-[#2A3942]">
          <p className="text-xs text-[#667781] dark:text-[#8696A0]">{channel.description}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="text-[#128C7E] animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Hash size={48} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-[#8696A0]">No messages in this channel yet.</p>
            {isAdmin && <p className="text-xs text-[#8696A0] mt-1">Start by posting a message below.</p>}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="flex justify-center">
            <div className="max-w-[75%] bg-white dark:bg-[#202C33] rounded-lg px-3 py-2 shadow-sm">
              {msg.senderName && (
                <p className="text-xs font-medium text-[#128C7E] mb-0.5">{msg.senderName}</p>
              )}
              {msg.type === 'image' && msg.mediaUrl && (
                <img src={msg.mediaUrl} alt="" className="max-w-full rounded-lg mb-1" loading="lazy" />
              )}
              <p className="text-sm text-gray-800 dark:text-[#E9EDEF] break-words">{msg.content}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right mt-1">
                {formatTimestamp(msg.createdAt)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input — only for admins */}
      {isAdmin && (
        <div className="px-3 py-2 bg-[#F0F2F5] dark:bg-[#202C33]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <div className="flex-1 bg-white dark:bg-[#2A3942] rounded-full px-4 py-2.5 shadow-sm">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Broadcast to channel..."
                className="w-full bg-transparent text-sm text-gray-800 dark:text-[#E9EDEF] placeholder-[#8696A0] outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:bg-[#20BD5B] disabled:opacity-50 shadow transition-colors"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      )}

      {/* Not subscribed notice */}
      {!isAdmin && !channel?.isSubscribed && (
        <div className="px-4 py-3 bg-[#F0F2F5] dark:bg-[#202C33] text-center">
          <button
            onClick={handleToggleSubscription}
            className="px-6 py-2.5 bg-[#128C7E] text-white font-semibold rounded-full hover:bg-[#075E54] text-sm"
          >
            Subscribe to this channel
          </button>
        </div>
      )}
    </div>
  );
}
