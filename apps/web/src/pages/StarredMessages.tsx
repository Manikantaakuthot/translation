import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Star } from 'lucide-react';
import { format } from 'date-fns';
import { messagesApi } from '../api/client';
import type { Message } from '../store/chatStore';

function getMessagePreview(msg: Message): string {
  switch (msg.type) {
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'voice':
    case 'audio': return '🎤 Voice message';
    case 'document': return '📄 Document';
    default: return msg.content || '';
  }
}

export default function StarredMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [unstarring, setUnstarring] = useState<string | null>(null);

  useEffect(() => {
    messagesApi.getStarred()
      .then(({ data }) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, []);

  const handleUnstar = async (msg: Message) => {
    setUnstarring(msg.id);
    try {
      await messagesApi.star(msg.id, false);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (err) {
      console.error('Failed to unstar:', err);
    } finally {
      setUnstarring(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] w-full">
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] flex items-center gap-3 bg-[#128C7E] dark:bg-[#202C33]">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft size={24} className="text-white" />
        </Link>
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <Star size={20} className="fill-yellow-300 text-yellow-300" />
          Starred Messages
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-gray-200 dark:border-[#2A3942] border-t-[#128C7E] rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <Star size={48} className="text-gray-200 dark:text-[#2A3942] mb-4" />
            <p className="text-lg font-medium text-gray-500 dark:text-[#8696A0]">No starred messages</p>
            <p className="text-sm text-gray-400 dark:text-[#8696A0] mt-1">
              Long-press a message and tap Star to save it here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#2A3942]">
            {messages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942]">
                <div className="w-10 h-10 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] dark:text-[#00A884] font-bold flex-shrink-0 text-sm">
                  {(msg.senderName || '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF] truncate">
                      {msg.senderName || 'Unknown'}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-[#8696A0] flex-shrink-0 ml-2">
                      {msg.createdAt ? format(new Date(msg.createdAt), 'dd/MM HH:mm') : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-[#8696A0] truncate">{getMessagePreview(msg)}</p>
                </div>
                <button
                  onClick={() => handleUnstar(msg)}
                  disabled={unstarring === msg.id}
                  className="flex-shrink-0 p-2 rounded-full hover:bg-yellow-50 dark:hover:bg-[#2A3942] disabled:opacity-50"
                  title="Unstar"
                >
                  <Star
                    size={18}
                    className={unstarring === msg.id ? 'text-gray-400 dark:text-[#8696A0]' : 'text-yellow-500 fill-yellow-500'}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
