import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Search, UserPlus, Phone, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { usersApi, conversationsApi } from '../api/client';

export default function NewChat() {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('+91');
  const { user } = useAuthStore();
  const { loadConversations } = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    usersApi.getContacts().then(({ data }) => setContacts(Array.isArray(data) ? data : [])).catch(() => setContacts([]));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSearchResults([]);
      setError('');
      setShowCreate(false);
      return;
    }

    const isPhoneQuery = /^\+?\d{8,}$/.test(q);

    if (isPhoneQuery) {
      if (q.startsWith('+')) {
        setNewPhone(q.slice(1));
        setNewCountryCode('');
      } else {
        setNewPhone(q);
        setNewCountryCode('+91');
      }
      setNewName('');
      setLoading(true);
      setError('');
      usersApi
        .search(q)
        .then(({ data }) => {
          const results = Array.isArray(data) ? data : [];
          setSearchResults(results);
          const hasResults = results.filter((u: any) => u.id !== user?.id).length > 0;
          setShowCreate(!hasResults);
        })
        .catch((err) => {
          setSearchResults([]);
          setError(err.response?.data?.message || 'Search failed');
        })
        .finally(() => setLoading(false));
    } else {
      const filtered = contacts.filter((c: any) => {
        const name = (c.displayName || c.name || '').toLowerCase();
        return name.includes(q.toLowerCase());
      });
      setSearchResults(filtered);
      setLoading(false);
      const hasMatches = filtered.filter((u: any) => u.id !== user?.id).length > 0;
      setShowCreate(!hasMatches);
      if (!hasMatches) {
        setNewName(q);
        setNewPhone('');
      }
    }
  }, [query, contacts]);

  const startChat = async (userId: string) => {
    setError('');
    setStarting(true);
    try {
      await usersApi.addContact(userId).catch(() => {});
      const { data } = await conversationsApi.getOrCreateDirect(userId);
      await loadConversations();
      navigate(`/chat/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to start chat');
    } finally {
      setStarting(false);
    }
  };

  const handleCreateAndChat = async () => {
    if (!newName.trim()) {
      setError('Please enter a contact name');
      return;
    }
    if (!newPhone.trim()) {
      setError('Please enter a phone number');
      return;
    }
    setError('');
    setStarting(true);
    try {
      const { data: newUser } = await usersApi.createByPhone(
        newPhone.trim(),
        newName.trim(),
        newCountryCode,
      );
      if (newUser?.id) {
        const { data: conv } = await conversationsApi.getOrCreateDirect(newUser.id);
        await loadConversations();
        navigate(`/chat/${conv.id}`);
      } else {
        setError('Failed to create contact');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create contact');
    } finally {
      setStarting(false);
    }
  };

  const allUsers = query.trim().length >= 1 ? searchResults : contacts;
  const filtered = (Array.isArray(allUsers) ? allUsers : []).filter((u) => u.id !== user?.id);

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] w-full">
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] flex items-center gap-3 bg-[#128C7E] dark:bg-[#202C33]">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft size={24} className="text-white" />
        </Link>
        <h1 className="text-xl font-semibold text-white">New Chat</h1>
      </div>
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-lg leading-none">
            ×
          </button>
        </div>
      )}
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696A0]" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone number"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-[#2A3942] border-0 focus:ring-2 focus:ring-[#128C7E] text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 dark:placeholder-[#8696A0]"
            autoFocus
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-[#8696A0]">Searching...</div>
        ) : (
          <>
            {/* Existing users from search results or contacts */}
            {filtered.length > 0 && (
              <div className="divide-y divide-gray-100 dark:divide-[#2A3942]">
                {filtered.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startChat(u.id)}
                    disabled={starting}
                    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left disabled:opacity-50"
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
                  </button>
                ))}
              </div>
            )}

            {/* Create new contact form - shown when no results found */}
            {showCreate && (
              <div className="p-4">
                <div className="bg-gray-50 dark:bg-[#202C33] rounded-xl p-5 border border-gray-200 dark:border-[#2A3942]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[#128C7E] flex items-center justify-center text-white">
                      <UserPlus size={24} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-[#E9EDEF]">Number not registered yet</p>
                      <p className="text-xs text-gray-500 dark:text-[#8696A0]">A guest account will be created. When they join MQ with this number, they'll receive your messages automatically.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Name field */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-[#8696A0] mb-1">Contact Name</label>
                      <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696A0]" />
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Enter name"
                          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-[#3B4A54] focus:ring-2 focus:ring-[#128C7E] focus:border-transparent text-sm bg-white dark:bg-[#2A3942] text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 dark:placeholder-[#8696A0]"
                          autoFocus={showCreate}
                        />
                      </div>
                    </div>

                    {/* Phone field */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-[#8696A0] mb-1">Phone Number</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCountryCode}
                          onChange={(e) => setNewCountryCode(e.target.value)}
                          placeholder={newCountryCode === '' ? '—' : '+91'}
                          disabled={newCountryCode === ''}
                          title={newCountryCode === '' ? 'Country code is included in the number' : undefined}
                          className="w-16 px-2 py-2.5 rounded-lg border border-gray-300 dark:border-[#3B4A54] focus:ring-2 focus:ring-[#128C7E] text-sm text-center bg-white dark:bg-[#2A3942] text-gray-800 dark:text-[#E9EDEF] disabled:bg-gray-100 dark:disabled:bg-[#202C33] disabled:text-gray-400 dark:disabled:text-[#8696A0] disabled:cursor-not-allowed"
                        />
                        <div className="relative flex-1">
                          <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696A0]" />
                          <input
                            type="text"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            placeholder="Enter phone number"
                            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-[#3B4A54] focus:ring-2 focus:ring-[#128C7E] focus:border-transparent text-sm bg-white dark:bg-[#2A3942] text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 dark:placeholder-[#8696A0]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCreateAndChat}
                    disabled={starting || !newName.trim() || !newPhone.trim()}
                    className="w-full mt-4 py-2.5 bg-[#128C7E] text-white rounded-lg font-medium hover:bg-[#075E54] disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
                  >
                    {starting ? 'Creating...' : 'Create Contact & Start Chat'}
                  </button>
                </div>
              </div>
            )}

            {/* Empty state when nothing typed */}
            {filtered.length === 0 && !showCreate && query.trim().length === 0 && (
              <div className="p-8 text-center text-gray-400 dark:text-[#8696A0]">
                <Search size={40} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Search by name or phone to start a chat</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
