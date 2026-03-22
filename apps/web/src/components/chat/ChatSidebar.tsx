import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Settings, LogOut, MessageSquarePlus, Star, Archive } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { messagesApi, conversationsApi, statusApi } from '../../api/client';
import ChatListItem from './ChatListItem';
import GlobalSearch from './GlobalSearch';

type Filter = 'all' | 'unread' | 'favorites' | 'groups';

const TABS = [
  { label: 'Chats', path: '/' },
  { label: 'Status', path: '/status' },
  { label: 'Channels', path: '/channels' },
  { label: 'Calls', path: '/calls' },
];

export default function ChatSidebar() {
  const { user, logout } = useAuthStore();
  const { conversations, selectedConversationId, loadConversations, isLoading } = useChatStore();
  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteConvIds, setFavoriteConvIds] = useState<Set<string>>(new Set());
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [hasUnviewedStatuses, setHasUnviewedStatuses] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user?.id) loadConversations();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load starred messages to determine favorite conversations
  useEffect(() => {
    if (!user?.id) return;
    messagesApi.getStarred().then(({ data }) => {
      const ids = new Set<string>();
      (Array.isArray(data) ? data : []).forEach((m: any) => { if (m.conversationId) ids.add(m.conversationId); });
      setFavoriteConvIds(ids);
    }).catch(() => {});
  }, [user?.id, conversations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for unviewed statuses (for tab badge)
  useEffect(() => {
    if (!user?.id) return;
    const checkStatuses = () => {
      statusApi.feed().then(({ data }) => {
        const others = (Array.isArray(data) ? data : []).filter((u: any) => u.userId !== user?.id);
        setHasUnviewedStatuses(others.some((u: any) => !u.allViewed));
      }).catch(() => {});
    };
    checkStatuses();
    // Also refresh when status:refresh event fires
    const handler = () => checkStatuses();
    window.addEventListener('status:refresh', handler);
    return () => window.removeEventListener('status:refresh', handler);
  }, [user?.id]);

  // Compute total unread count for badge + document title
  const totalUnread = useMemo(() => {
    return (conversations || []).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
  }, [conversations]);

  // Update document title with unread count
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) MQ` : 'MQ';
  }, [totalUnread]);

  // Split conversations into active/archived
  const activeConversations = useMemo(() => (conversations || []).filter((c) => !(c as any).isArchived), [conversations]);
  const archivedConversations = useMemo(() => (conversations || []).filter((c) => (c as any).isArchived), [conversations]);

  const filteredConversations = (showArchived ? archivedConversations : activeConversations).filter((conv) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const otherParticipant = (conv.participants || []).find((p) => p.userId !== user?.id);
      const name = conv.name || otherParticipant?.name || '';
      if (!name.toLowerCase().includes(q)) return false;
    }
    if (activeFilter === 'unread') return (conv.unreadCount ?? 0) > 0;
    if (activeFilter === 'groups') return conv.type === 'group';
    if (activeFilter === 'favorites') return favoriteConvIds.has(conv.id);
    return true;
  });

  // Determine active tab
  const isTabActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname.startsWith('/chat');
    return location.pathname.startsWith(path);
  };

  const isChatsTab = isTabActive('/');

  // Show global search panel
  if (showGlobalSearch) {
    return <GlobalSearch onClose={() => setShowGlobalSearch(false)} />;
  }

  return (
    <div className="w-full md:w-[420px] bg-white dark:bg-[#111B21] border-r border-gray-200 dark:border-[#2A3942] flex flex-col h-screen relative">

      {/* ── Header ── */}
      <div className="bg-[#128C7E] dark:bg-[#202C33] px-4 py-3 flex items-center justify-between">
        {/* Left: user avatar */}
        <Link to="/settings" className="flex-shrink-0">
          {user?.profilePictureUrl ? (
            <img
              src={user.profilePictureUrl}
              alt={user.name}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-white/30"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center text-white font-bold text-lg select-none">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </Link>

        {/* Right: action icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowGlobalSearch(true)}
            className="p-2 rounded-full hover:bg-white/15 text-white/90"
            title="Search Messages"
          >
            <Search size={20} />
          </button>
          <Link
            to="/starred"
            className="p-2 rounded-full hover:bg-white/15 text-white/90"
            title="Starred Messages"
          >
            <Star size={20} />
          </Link>
          <Link
            to="/settings"
            className="p-2 rounded-full hover:bg-white/15 text-white/90"
            title="Settings"
          >
            <Settings size={20} />
          </Link>
          <button
            onClick={logout}
            className="p-2 rounded-full hover:bg-white/15 text-white/90"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* ── WhatsApp-style Tab Bar ── */}
      <div className="flex bg-[#128C7E] dark:bg-[#202C33]">
        {TABS.map(({ label, path }) => {
          const active = isTabActive(path);
          return (
            <Link
              key={label}
              to={path}
              className={`flex-1 py-3 text-center text-xs font-semibold tracking-widest uppercase transition-colors ${
                active
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/55 border-b-2 border-transparent hover:text-white/80'
              }`}
            >
              {label}
              {label === 'Chats' && totalUnread > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#128C7E] text-[10px] font-bold leading-none">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
              {label === 'Status' && hasUnviewedStatuses && (
                <span className="ml-1 inline-block w-2 h-2 bg-[#25D366] rounded-full" />
              )}
            </Link>
          );
        })}
      </div>

      {/* ── Search bar (only on Chats tab) ── */}
      {isChatsTab && (
        <div className="px-3 py-2 bg-[#F0F2F5] dark:bg-[#111B21]">
          <div className="flex items-center bg-white dark:bg-[#2A3942] rounded-xl px-3 py-2 gap-2 shadow-sm">
            <Search size={16} className="text-[#54656F] dark:text-[#8696A0] flex-shrink-0" />
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent flex-1 text-sm text-gray-700 dark:text-[#E9EDEF] placeholder-[#8696A0] outline-none"
            />
          </div>
        </div>
      )}

      {/* ── Filter chips (only on Chats tab) ── */}
      {isChatsTab && (
        <div className="flex gap-2 px-3 py-2 bg-[#F0F2F5] dark:bg-[#111B21] overflow-x-auto border-b border-gray-200 dark:border-[#2A3942]">
          {(['all', 'unread', 'favorites', 'groups'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors capitalize ${
                activeFilter === f
                  ? 'bg-[#D9FDD3] text-[#025144] dark:bg-[#005C4B] dark:text-[#E9EDEF]'
                  : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] hover:bg-gray-100 dark:hover:bg-[#2A3942]'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* ── Chat list (only on Chats tab) ── */}
      {isChatsTab && (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111B21]">
          {/* Archived chats link */}
          {!showArchived && archivedConversations.length > 0 && activeFilter === 'all' && !searchQuery && (
            <button
              onClick={() => setShowArchived(true)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] border-b border-gray-100 dark:border-[#2A3942] text-left"
            >
              <div className="w-[50px] h-[50px] rounded-full bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
                <Archive size={20} className="text-[#25D366]" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-[#128C7E] dark:text-[#00A884]">Archived</p>
              </div>
              <span className="text-xs text-[#128C7E] dark:text-[#00A884] font-medium">{archivedConversations.length}</span>
            </button>
          )}

          {/* Archived header */}
          {showArchived && (
            <button
              onClick={() => setShowArchived(false)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-gray-200 dark:border-[#2A3942] text-left"
            >
              <Archive size={18} className="text-[#128C7E]" />
              <span className="text-sm font-semibold text-[#128C7E] dark:text-[#00A884]">Archived Chats</span>
              <span className="text-xs text-gray-500 dark:text-[#8696A0] ml-auto">← Back</span>
            </button>
          )}

          {/* Loading skeleton */}
          {isLoading && filteredConversations.length === 0 && (
            <div className="pt-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-[50px] h-[50px] rounded-full bg-gray-200 dark:bg-[#2A3942] flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-200 dark:bg-[#2A3942] rounded w-2/3" />
                    <div className="h-3 bg-gray-100 dark:bg-[#202C33] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredConversations.map((conv) => (
            <ChatListItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversationId === conv.id}
              currentUserId={user?.id || ''}
            />
          ))}

          {filteredConversations.length === 0 && !isLoading && (
            <div className="px-4 py-16 text-center text-[#8696A0]">
              <p className="text-sm">
                {searchQuery ? 'No results found' : activeFilter !== 'all' ? `No ${activeFilter} chats` : 'No conversations yet'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Floating Action Button (New Chat) — only on Chats tab ── */}
      {isChatsTab && (
        <Link
          to="/new-chat"
          className="absolute bottom-5 right-4 w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg hover:bg-[#20BD5B] transition-colors z-10"
          title="New Chat"
        >
          <MessageSquarePlus size={24} className="text-white" />
        </Link>
      )}
    </div>
  );
}
