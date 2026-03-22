import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, Video, MoreVertical, Bell, BellOff, Archive, Languages, Pin, Search, ArrowUp, ArrowDown, X, Clock, Timer } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { useCallStore } from '../../store/callStore';
import { callsApi, conversationsApi, messagesApi } from '../../api/client';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import GroupInfo from './GroupInfo';
import ContactInfo from './ContactInfo';
import Modal from '../shared/Modal';
import type { Message } from '../../store/chatStore';
import { useTranslationStore, LANGUAGE_OPTIONS } from '../../store/translationStore';
import { useWallpaperStore } from '../../store/wallpaperStore';
import WallpaperPicker from './WallpaperPicker';

export default function ChatWindow() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const {
    conversations,
    messages,
    typingUsers,
    replyMessage,
    loadConversations,
    loadMessages,
    selectConversation,
    setReplyMessage,
    markMessagesRead,
    deleteMessage,
    deleteMessageForMe,
    updateConversation,
    forwardMessage,
    starMessage,
    pinMessage,
  } = useChatStore();
  const { setActiveCall } = useCallStore();
  const { preferredLanguage, autoTranslateMessages, setPreferredLanguage, saveLanguagePreferences, clearTranslations } = useTranslationStore();
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [forwardModalMessage, setForwardModalMessage] = useState<Message | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const wallpaperStyle = useWallpaperStore((s) => s.getBackgroundStyle)();
  const { wallpaper: storeWallpaper, setWallpaper: setStoreWallpaper } = useWallpaperStore();
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);

  const handleForward = (message: Message) => setForwardModalMessage(message);

  const handleDelete = async (message: Message, deleteForEveryone: boolean) => {
    if (!message?.id) return;
    if (message.id.startsWith('temp-')) {
      // Optimistic/failed local message does not exist on server.
      // Remove locally and skip API call to avoid server errors.
      deleteMessageForMe(message.id, message.conversationId);
      return;
    }
    try {
      await messagesApi.delete(message.id, deleteForEveryone);
      if (deleteForEveryone) {
        deleteMessage(message.id, message.conversationId);
      } else {
        deleteMessageForMe(message.id, message.conversationId);
      }
    } catch (err: any) {
      const apiMessage = err?.response?.data?.message;
      const messageText = Array.isArray(apiMessage) ? apiMessage.join(', ') : apiMessage;
      alert(messageText || 'Failed to delete message');
    }
  };

  const handleReply = (message: Message) => setReplyMessage(message);
  const handleReact = async (messageId: string, emoji: string) => {
    try {
      await messagesApi.addReaction(messageId, emoji);
      if (id) loadMessages(id); // refresh to show updated reaction counts
    } catch {}
  };
  const handleStar = (message: Message) => starMessage(message.id, message.conversationId, !message.isStarred);
  const handleEdit = (message: Message) => setEditingMessage(message);
  const handlePin = (message: Message) => {
    pinMessage(message.id, message.conversationId, !message.isPinned);
    // Update local pinned messages state
    if (!message.isPinned) {
      setPinnedMessages((prev) => [{ ...message, isPinned: true }, ...prev.filter((m) => m.id !== message.id)]);
    } else {
      setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
    }
  };

  const handleForwardTo = async (targetConversationId: string) => {
    if (!forwardModalMessage) return;
    await forwardMessage(forwardModalMessage.id, targetConversationId);
    setForwardModalMessage(null);
  };

  const handleCall = async (type: 'voice' | 'video') => {
    const targetUserId = conv?.type === 'direct' ? otherUser?.userId : undefined;
    if (!targetUserId) {
      console.error('handleCall: no targetUserId', { convType: conv?.type, otherUser });
      return;
    }
    try {
      const { data } = await callsApi.initiate(targetUserId, type);
      setActiveCall({
        callId: data.id,
        otherUserId: targetUserId,
        otherUserName: otherUser?.name || conv?.name || 'Unknown',
        type,
        isInitiator: true,
      });
    } catch (err: any) {
      console.error('Call initiation failed:', err);
      alert(`Call failed: ${err?.response?.data?.message || err?.message || 'Unknown error'}`);
    }
  };
  const socketConnected = useChatStore((s) => s.socketConnected);
  const msgs = id ? messages[id] || [] : [];
  const conv = (conversations || []).find((c) => c.id === id);
  const typing = id ? typingUsers[id] || [] : [];
  const otherUser = (conv?.participants || []).find((p) => p.userId !== user?.id);

  // Search: filter text messages matching query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return msgs.filter((m) => m.type === 'text' && m.content && m.content.toLowerCase().includes(q));
  }, [msgs, searchQuery]);

  const highlightedMessageId = searchResults.length > 0 ? searchResults[activeResultIndex]?.id : undefined;

  // Reset search when conversation changes
  useEffect(() => {
    setShowSearch(false);
    setSearchQuery('');
    setActiveResultIndex(0);
  }, [id]);

  // Focus input when search opens
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  // Clamp activeResultIndex when results change
  useEffect(() => {
    if (activeResultIndex >= searchResults.length) setActiveResultIndex(Math.max(0, searchResults.length - 1));
  }, [searchResults.length]);

  const handleSearchPrev = () => {
    if (searchResults.length === 0) return;
    setActiveResultIndex((i) => (i <= 0 ? searchResults.length - 1 : i - 1));
  };
  const handleSearchNext = () => {
    if (searchResults.length === 0) return;
    setActiveResultIndex((i) => (i >= searchResults.length - 1 ? 0 : i + 1));
  };
  const closeSearch = () => {
    setShowSearch(false);
    setSearchQuery('');
    setActiveResultIndex(0);
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (id) {
      selectConversation(id);
      loadMessages(id);
      updateConversation(id, { unreadCount: 0 });
      // Load pinned messages
      messagesApi.getPinned(id).then(({ data }) => {
        setPinnedMessages(Array.isArray(data) ? data : []);
      }).catch(() => {});
    } else {
      // Important: do NOT clear selectedConversationId here.
      // The "/" route is a placeholder; WhatsApp-like UX expects us to restore
      // the last opened conversation after refresh.
      setPinnedMessages([]);
    }
  }, [id]);

  useEffect(() => {
    if (id && msgs.length > 0) {
      const unread = msgs.filter((m) => m.senderId !== user?.id && !(m.status?.read?.length));
      if (unread.length > 0) {
        markMessagesRead(id, unread.map((m) => m.id));
      }
      updateConversation(id, { unreadCount: 0 });
    }
  }, [id, msgs, user?.id]);

  // Socket event listeners are now handled globally in GlobalSocketListener

  if (!id) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A]">
        <div className="text-center">
          <div className="mx-auto mb-6">
            <svg
              width="80"
              height="80"
              viewBox="0 0 80 80"
              fill="none"
              className="mx-auto"
            >
              <path
                d="M40 8C22.33 8 8 21.13 8 37.2c0 5.4 1.6 10.5 4.6 15L8 72l20.7-5.4C32.3 68.2 36.1 69 40 69c17.67 0 32-13.13 32-29.2S57.67 8 40 8z"
                fill="#CFD8DC"
                stroke="#B0BEC5"
                strokeWidth="2"
              />
              <path
                d="M40 14c-14.9 0-27 10.97-27 24.5 0 4.6 1.3 8.9 3.7 12.6L14 64l13.5-3.5c3.5 1.8 7.5 2.8 11.8 2.8 15.5 0 28-11.3 28-25S55.5 14 40 14z"
                fill="none"
                stroke="#B0BEC5"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-light text-gray-700 dark:text-[#E9EDEF] mb-2">MQ</h1>
          <p className="text-sm text-gray-500 dark:text-[#8696A0]">Select a chat to start messaging</p>
        </div>
      </div>
    );
  }

  // Show loading state while conversation data is being fetched
  if (!conv) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#E5DDD5] dark:bg-[#0B141A]">
        <div className="w-8 h-8 border-4 border-gray-300 dark:border-[#2A3942] border-t-[#128C7E] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-row min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden" style={wallpaperStyle}>
      {showGroupInfo && conv?.type === 'group' && (
        <GroupInfo groupId={id} onClose={() => setShowGroupInfo(false)} />
      )}
      <div className="bg-[#F0F2F5] dark:bg-[#202C33] px-4 py-3 border-b border-gray-200 dark:border-[#2A3942] flex items-center gap-3">
        <button
          onClick={() => {
            if (conv?.type === 'group') setShowGroupInfo(true);
            else if (conv?.type === 'direct') setShowContactInfo(true);
          }}
          className="flex-1 flex items-center gap-3 text-left hover:bg-gray-100 dark:hover:bg-[#2A3942] rounded-lg -m-2 p-2 min-w-0"
        >
          <div className="w-10 h-10 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] font-bold flex-shrink-0">
            {(conv?.name || otherUser?.name || '?')[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-800 dark:text-[#E9EDEF] truncate">
              {conv?.name || otherUser?.name || 'Chat'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-[#8696A0] flex items-center gap-1">
              {!socketConnected && (
                <span className="inline-flex items-center gap-1 text-yellow-600" title="Reconnecting...">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  Connecting...
                </span>
              )}
              {socketConnected && (conv?.type === 'group' ? (
                `${conv.participants?.length || 0} members`
              ) : otherUser?.isOnline ? (
                <span className="text-green-600">Online</span>
              ) : (
                'Offline'
              ))}
            </p>
          </div>
        </button>
        <div className="flex gap-1 items-center relative">
          {conv?.type === 'direct' && otherUser && (
            <>
              <button
                onClick={() => handleCall('voice')}
                className="p-3 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942] active:bg-gray-300 text-gray-600 dark:text-[#8696A0]"
                title="Voice call"
              >
                <Phone size={20} />
              </button>
              <button
                onClick={() => handleCall('video')}
                className="p-3 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942] active:bg-gray-300 text-gray-600 dark:text-[#8696A0]"
                title="Video call"
              >
                <Video size={20} />
              </button>
            </>
          )}
          <button
            onClick={() => { setShowSearch((v) => !v); if (showSearch) closeSearch(); }}
            className={`p-3 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942] active:bg-gray-300 ${showSearch ? 'text-[#128C7E]' : 'text-gray-600 dark:text-[#8696A0]'}`}
            title="Search messages"
          >
            <Search size={20} />
          </button>
          {autoTranslateMessages && (
            <div className="relative">
              <button
                onClick={() => setShowLangDropdown(!showLangDropdown)}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942] text-[#128C7E] flex items-center gap-1"
                title="Translation language"
              >
                <Languages size={18} />
                <span className="text-xs font-medium uppercase">{preferredLanguage}</span>
              </button>
              {showLangDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowLangDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 py-1 bg-white dark:bg-[#202C33] rounded-lg shadow-xl border border-gray-200 dark:border-[#2A3942] z-20 min-w-[180px] max-h-60 overflow-y-auto">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={async () => {
                          setPreferredLanguage(lang.code);
                          clearTranslations();
                          setShowLangDropdown(false);
                          try { await saveLanguagePreferences(); } catch {}
                        }}
                        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-[#2A3942] ${
                          preferredLanguage === lang.code ? 'bg-[#128C7E]/10 text-[#128C7E] font-medium' : 'text-gray-700 dark:text-[#E9EDEF]'
                        }`}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.name}</span>
                        {preferredLanguage === lang.code && <span className="ml-auto text-[#128C7E]">&#10003;</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setShowChatMenu(!showChatMenu)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942] text-gray-600 dark:text-[#8696A0]"
            title="Chat options"
          >
            <MoreVertical size={20} />
          </button>
          {showChatMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowChatMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 py-1 bg-white dark:bg-[#202C33] rounded-lg shadow-xl border border-gray-200 dark:border-[#2A3942] z-20 min-w-[160px]">
                <button
                  onClick={async () => {
                    if (!id) return;
                    try {
                      await conversationsApi.mute(id, !conv?.isMuted);
                      updateConversation(id, { isMuted: !conv?.isMuted });
                    } catch {}
                    setShowChatMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-[#2A3942] dark:text-[#E9EDEF]"
                >
                  {conv?.isMuted ? <Bell size={16} /> : <BellOff size={16} />}
                  {conv?.isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  onClick={async () => {
                    if (!id) return;
                    try {
                      await conversationsApi.archive(id, !conv?.isArchived);
                      updateConversation(id, { isArchived: !conv?.isArchived });
                    } catch {}
                    setShowChatMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-[#2A3942] dark:text-[#E9EDEF]"
                >
                  <Archive size={16} />
                  {conv?.isArchived ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  onClick={() => { setShowChatMenu(false); setShowDisappearingMenu(true); }}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-[#2A3942] dark:text-[#E9EDEF]"
                >
                  <Timer size={16} />
                  Disappearing messages
                </button>
                <button
                  onClick={() => {
                    setShowChatMenu(false);
                    setShowWallpaperPicker(true);
                  }}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-[#2A3942] dark:text-[#E9EDEF]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  Wallpaper
                </button>
                <button
                  onClick={() => {
                    setShowChatMenu(false);
                    // Export chat
                    import('../../utils/chatExport').then(({ exportChatAsText }) => {
                      const chatName = conv?.name || conv?.participants?.map(p => p.name).filter(Boolean).join(', ') || 'Chat';
                      exportChatAsText(msgs, chatName, conv?.participants);
                    });
                  }}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-[#2A3942] dark:text-[#E9EDEF]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export Chat
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Pinned message banner */}
      {pinnedMessages.length > 0 && (
        <div className="bg-white dark:bg-[#202C33] border-b border-gray-200 dark:border-[#2A3942] px-4 py-2 flex items-center gap-2 text-sm">
          <Pin size={14} className="text-[#128C7E] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#128C7E] font-medium leading-none mb-0.5">Pinned Message</p>
            <p className="text-gray-600 dark:text-[#8696A0] truncate text-xs">
              {pinnedMessages[0]?.type !== 'text'
                ? `[${pinnedMessages[0]?.type}]`
                : pinnedMessages[0]?.content}
            </p>
          </div>
          {pinnedMessages.length > 1 && (
            <span className="text-[10px] text-gray-400 dark:text-[#8696A0] flex-shrink-0">{pinnedMessages.length} pinned</span>
          )}
        </div>
      )}
      {/* WhatsApp-style search bar — slides in below header */}
      {showSearch && (
        <div className="bg-[#F0F2F5] dark:bg-[#111B21] border-b border-gray-200 dark:border-[#2A3942] px-4 py-2 flex items-center gap-2">
          <div className="flex-1 flex items-center bg-white dark:bg-[#2A3942] rounded-lg px-3 py-[7px] gap-2">
            <Search size={16} className="text-[#54656F] dark:text-[#8696A0] flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setActiveResultIndex(0); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.shiftKey ? handleSearchPrev() : handleSearchNext();
                if (e.key === 'Escape') closeSearch();
              }}
              placeholder="Search messages"
              className="bg-transparent flex-1 text-sm text-gray-700 dark:text-[#E9EDEF] placeholder-[#8696A0] outline-none min-w-0"
            />
            {searchQuery && (
              <span className="text-xs text-[#667781] flex-shrink-0 tabular-nums">
                {searchResults.length > 0
                  ? `${activeResultIndex + 1} of ${searchResults.length}`
                  : 'No results'}
              </span>
            )}
          </div>
          <button
            onClick={handleSearchPrev}
            disabled={searchResults.length === 0}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942] text-[#54656F] dark:text-[#8696A0] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Previous result"
          >
            <ArrowUp size={18} />
          </button>
          <button
            onClick={handleSearchNext}
            disabled={searchResults.length === 0}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942] text-[#54656F] dark:text-[#8696A0] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Next result"
          >
            <ArrowDown size={18} />
          </button>
          <button
            onClick={closeSearch}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942] text-[#54656F] dark:text-[#8696A0]"
            title="Close search"
          >
            <X size={18} />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden flex flex-col">
        <MessageList
          messages={msgs}
          currentUserId={user?.id || ''}
          isGroup={conv?.type === 'group'}
          onProfileClick={(userId) => {
            if (conv?.type === 'direct') setShowContactInfo(true);
          }}
          onVisible={(convId, msgIds) => markMessagesRead(convId, msgIds)}
          onForward={handleForward}
          onDelete={handleDelete}
          onReply={handleReply}
          onReact={handleReact}
          onStar={handleStar}
          onPin={handlePin}
          onEdit={handleEdit}
          highlightedMessageId={highlightedMessageId}
          searchQuery={showSearch ? searchQuery : ''}
          wallpaper={storeWallpaper || undefined}
        />
        <TypingIndicator userIds={typing} participants={conv?.participants || []} />
        <MessageInput
          conversationId={id}
          replyMessage={replyMessage}
          onClearReply={() => setReplyMessage(null)}
          editingMessage={editingMessage}
          onClearEdit={() => setEditingMessage(null)}
          participants={conv?.participants}
          isGroup={conv?.type === 'group'}
        />
      </div>

      {/* Disappearing Messages Modal */}
      {showDisappearingMenu && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowDisappearingMenu(false)}>
          <div className="bg-white dark:bg-[#202C33] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 bg-[#128C7E] dark:bg-[#202C33] flex items-center justify-between">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <Timer size={16} /> Disappearing messages
              </span>
              <button onClick={() => setShowDisappearingMenu(false)} className="p-1 rounded-full hover:bg-white/20 text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 dark:text-[#8696A0] mb-3">New messages will disappear from this chat after the selected duration.</p>
              {[
                { label: 'Off', value: 0 },
                { label: '24 hours', value: 24 * 60 * 60 * 1000 },
                { label: '7 days', value: 7 * 24 * 60 * 60 * 1000 },
                { label: '90 days', value: 90 * 24 * 60 * 60 * 1000 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={async () => {
                    try {
                      await messagesApi.setDisappearing(id!, opt.value);
                      setShowDisappearingMenu(false);
                    } catch (err) {
                      console.error('Failed to set disappearing:', err);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] rounded-lg text-left"
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${opt.value === 0 ? 'border-gray-300' : 'border-[#128C7E]'}`}>
                    {opt.value > 0 && <Clock size={10} className="text-[#128C7E]" />}
                  </div>
                  <span className="text-sm text-gray-800 dark:text-[#E9EDEF]">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={!!forwardModalMessage}
        onClose={() => setForwardModalMessage(null)}
        title="Forward to"
      >
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {(conversations || [])
            .filter((c) => c.id !== id)
            .map((c) => {
              const other = (c.participants || []).find((p) => p.userId !== user?.id);
              const name = c.name || other?.name || 'Unknown';
              return (
                <button
                  key={c.id}
                  onClick={() => handleForwardTo(c.id)}
                  className="w-full px-4 py-3 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-[#2A3942] flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] font-bold">
                    {name[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="font-medium text-gray-800 dark:text-[#E9EDEF]">{name}</span>
                </button>
              );
            })}
          {(conversations || []).filter((c) => c.id !== id).length === 0 && (
            <p className="text-gray-500 dark:text-[#8696A0] text-sm py-4">No other conversations</p>
          )}
        </div>
      </Modal>
      {/* Wallpaper Picker Modal */}
      {showWallpaperPicker && (
        <WallpaperPicker
          currentWallpaper={storeWallpaper}
          onSelect={(wp) => setStoreWallpaper(wp)}
          onClose={() => setShowWallpaperPicker(false)}
        />
      )}
      </div>{/* end main chat column */}

      {/* WhatsApp-style contact info side panel */}
      <div
        className={`flex-shrink-0 overflow-hidden border-l border-[#2A3942] transition-all duration-300 ${
          showContactInfo && conv?.type === 'direct' && otherUser?.userId
            ? 'w-[380px]'
            : 'w-0'
        }`}
      >
        {showContactInfo && conv?.type === 'direct' && otherUser?.userId && (
          <ContactInfo
            conversationId={id}
            userId={otherUser.userId}
            onClose={() => setShowContactInfo(false)}
          />
        )}
      </div>
    </div>
  );
}
