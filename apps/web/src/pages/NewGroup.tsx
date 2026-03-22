import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { usersApi, conversationsApi } from '../api/client';

export default function NewGroup() {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { user } = useAuthStore();
  const { loadConversations } = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    usersApi.getContacts().then(({ data }) => setContacts(Array.isArray(data) ? data : [])).catch(() => setContacts([]));
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    usersApi
      .search(query)
      .then(({ data }) => setSearchResults(Array.isArray(data) ? data : []))
      .catch(() => setSearchResults([]))
      .finally(() => setLoading(false));
  }, [query]);

  const allUsers = query.length >= 2 ? searchResults : contacts;
  const filtered = (Array.isArray(allUsers) ? allUsers : []).filter((u) => u.id !== user?.id);

  const toggleUser = (userId: string) => {
    setSelected((s) => (s.includes(userId) ? s.filter((id) => id !== userId) : [...s, userId]));
  };

  const createGroup = async () => {
    if (!groupName.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      const { data } = await conversationsApi.create({
        type: 'group',
        participantIds: selected,
        name: groupName.trim(),
      });
      await loadConversations();
      navigate(`/chat/${data.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] w-full">
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] flex items-center gap-3 bg-[#128C7E] dark:bg-[#202C33]">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft size={24} className="text-white" />
        </Link>
        <h1 className="text-xl font-semibold text-white">New Group</h1>
      </div>
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] space-y-4">
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Group name"
          className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-[#3B4A54] focus:ring-2 focus:ring-[#128C7E] focus:border-transparent bg-white dark:bg-[#2A3942] text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 dark:placeholder-[#8696A0]"
        />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696A0]" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-[#2A3942] border-0 focus:ring-2 focus:ring-[#128C7E] text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 dark:placeholder-[#8696A0]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {selected.length > 0 && (
          <div className="p-2 border-b border-gray-100 dark:border-[#2A3942] flex flex-wrap gap-2">
            {selected.map((id) => {
              const contactsList = Array.isArray(contacts) ? contacts : [];
              const searchList = Array.isArray(searchResults) ? searchResults : [];
              const u = [...contactsList, ...searchList].find((x) => x.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-[#128C7E]/20 dark:bg-[#00A884]/20 rounded-full text-sm text-gray-800 dark:text-[#E9EDEF]"
                >
                  {u?.name || u?.displayName || id}
                  <button
                    type="button"
                    onClick={() => toggleUser(id)}
                    className="hover:text-red-600 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-[#8696A0]">Searching...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-[#8696A0]">
            {query.length >= 2 ? 'No users found' : 'Search for users to add to the group'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#2A3942]">
            {filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => toggleUser(u.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
              >
                <div className="w-12 h-12 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] dark:text-[#00A884] font-bold">
                  {(u.name || u.displayName || '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-800 dark:text-[#E9EDEF] truncate">
                    {u.displayName || u.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-[#8696A0] truncate">{u.phone}</p>
                </div>
                {selected.includes(u.id) && (
                  <div className="w-8 h-8 rounded-full bg-[#128C7E] dark:bg-[#00A884] flex items-center justify-center text-white">
                    <Check size={18} />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 border-t border-gray-200 dark:border-[#2A3942] bg-white dark:bg-[#111B21]">
        <button
          onClick={createGroup}
          disabled={!groupName.trim() || selected.length === 0 || creating}
          className="w-full py-3 bg-[#128C7E] text-white font-semibold rounded-lg hover:bg-[#075E54] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? 'Creating...' : `Create Group (${selected.length} members)`}
        </button>
      </div>
    </div>
  );
}
