import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { useChatStore } from '../../store/chatStore';
import { messagesApi } from '../../api/client';

interface SearchResult {
  id: string;
  conversationId: string;
  content: string;
  senderName?: string;
  createdAt: string;
  conversationName?: string;
  type?: string;
}

interface GroupedResults {
  conversationId: string;
  conversationName: string;
  messages: SearchResult[];
}

interface Props {
  onClose: () => void;
}

export default function GlobalSearch({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const { setHighlightedMessageId } = useChatStore();

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) { setResults([]); setHasSearched(false); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const { data } = await messagesApi.search(trimmed);
      setResults(Array.isArray(data) ? data : []);
      setHasSearched(true);
    } catch {
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); setHasSearched(false); setIsLoading(false); return; }
    setIsLoading(true);
    debounceRef.current = setTimeout(() => performSearch(value), 300);
  };

  const handleResultClick = (result: SearchResult) => {
    setHighlightedMessageId(result.id);
    navigate(`/chat/${result.conversationId}`);
    onClose();
  };

  const clearSearch = () => { setQuery(''); setResults([]); setHasSearched(false); inputRef.current?.focus(); };

  // Group results by conversation
  const groupedResults: GroupedResults[] = results.reduce<GroupedResults[]>((groups, msg) => {
    const existing = groups.find((g) => g.conversationId === msg.conversationId);
    if (existing) { existing.messages.push(msg); }
    else { groups.push({ conversationId: msg.conversationId, conversationName: msg.conversationName || 'Unknown Chat', messages: [msg] }); }
    return groups;
  }, []);

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-yellow-300/80 dark:bg-yellow-500/40 text-inherit font-semibold rounded-sm px-0.5">{part}</mark>
          ) : (<span key={i}>{part}</span>)
        )}
      </span>
    );
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) return format(date, 'HH:mm');
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return format(date, 'dd/MM/yyyy');
    } catch { return ''; }
  };

  return (
    <div className="w-full md:w-[420px] bg-white dark:bg-[#111B21] border-r border-gray-200 dark:border-[#2A3942] flex flex-col h-screen">
      {/* Header */}
      <div className="bg-[#128C7E] dark:bg-[#202C33] px-4 py-3 flex items-center gap-4">
        <button onClick={onClose} className="p-1 rounded-full hover:bg-white/15 text-white/90" title="Back">
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-white font-medium text-base">Search Messages</h2>
      </div>

      {/* Search Input */}
      <div className="px-3 py-2 bg-[#F0F2F5] dark:bg-[#111B21]">
        <div className="flex items-center bg-white dark:bg-[#2A3942] rounded-xl px-3 py-2 gap-2 shadow-sm">
          <Search size={16} className="text-[#54656F] dark:text-[#8696A0] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search across all chats..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            className="bg-transparent flex-1 text-sm text-gray-700 dark:text-[#E9EDEF] placeholder-[#8696A0] outline-none"
          />
          {query && (
            <button onClick={clearSearch} className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#3B4A54]">
              <X size={16} className="text-[#54656F] dark:text-[#8696A0]" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111B21]">
        {isLoading && (
          <div className="pt-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-4 py-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-[42px] h-[42px] rounded-full bg-gray-200 dark:bg-[#2A3942] flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-200 dark:bg-[#2A3942] rounded w-1/3" />
                    <div className="h-3 bg-gray-100 dark:bg-[#202C33] rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !hasSearched && !query.trim() && (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-center mb-4">
              <Search size={28} className="text-[#8696A0]" />
            </div>
            <p className="text-sm text-[#8696A0]">Search for messages across all your conversations.</p>
          </div>
        )}

        {!isLoading && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-center mb-4">
              <Search size={28} className="text-[#8696A0]" />
            </div>
            <p className="text-sm text-[#8696A0]">No messages found for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {!isLoading && groupedResults.length > 0 && (
          <div>
            {groupedResults.map((group) => (
              <div key={group.conversationId}>
                <div className="px-4 py-2 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-gray-200 dark:border-[#2A3942]">
                  <span className="text-xs font-semibold text-[#128C7E] dark:text-[#00A884] uppercase tracking-wide">
                    {group.conversationName}
                  </span>
                </div>
                {group.messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => handleResultClick(msg)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[#F5F6F6] dark:hover:bg-[#2A3942] transition-colors border-b border-[#F0F2F5] dark:border-[#2A3942]"
                  >
                    <div className="w-[42px] h-[42px] rounded-full bg-[#DFE5E7] dark:bg-[#2A3942] flex items-center justify-center text-[#54656F] dark:text-[#8696A0] font-semibold text-base select-none flex-shrink-0 mt-0.5">
                      {(msg.senderName || group.conversationName)?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-sm font-medium text-[#111B21] dark:text-[#E9EDEF] truncate">{msg.senderName || 'Unknown'}</span>
                        <span className="text-[11px] text-[#667781] dark:text-[#8696A0] flex-shrink-0">{formatTimestamp(msg.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[#667781] dark:text-[#8696A0] mt-0.5 line-clamp-2 leading-relaxed">
                        {highlightText(msg.content || '', query)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
