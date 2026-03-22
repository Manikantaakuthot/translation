import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, UserPlus, MessageCircle, UserMinus } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { usersApi, conversationsApi } from '../api/client';

export default function Contacts() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const { user } = useAuthStore();
  const { loadConversations } = useChatStore();
  const navigate = useNavigate();

  const loadContacts = () => {
    usersApi.getContacts().then(({ data }) => setContacts(Array.isArray(data) ? data : [])).catch(() => setContacts([]));
  };

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    usersApi
      .search(searchQuery.trim())
      .then(({ data }) => setSearchResults(Array.isArray(data) ? data : []))
      .catch((err) => {
        setSearchResults([]);
        setError(err.response?.data?.message || 'Could not search. Is the API running?');
      })
      .finally(() => setLoading(false));
  }, [searchQuery]);

  const handleAddContact = async (userId: string) => {
    setError('');
    setAdding(true);
    try {
      await usersApi.addContact(userId);
      loadContacts();
      setSearchQuery('');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to add contact. Is the API running?';
      setError(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveContact = async (userId: string) => {
    if (!confirm('Remove this contact?')) return;
    try {
      await usersApi.removeContact(userId);
      loadContacts();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to remove contact');
    }
  };

  const handleStartChat = async (userId: string) => {
    setError('');
    setAdding(true);
    try {
      await usersApi.addContact(userId).catch(() => {});
      const { data } = await conversationsApi.getOrCreateDirect(userId);
      await loadConversations();
      navigate(`/chat/${data.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to start chat. Is the API running?';
      setError(msg);
    } finally {
      setAdding(false);
    }
  };

  const contactIds = contacts.map((c) => c.id);
  const searchToShow = (Array.isArray(searchResults) ? searchResults : []).filter(
    (u) => u.id !== user?.id && !contactIds.includes(u.id)
  );

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] w-full">
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] flex items-center gap-3 bg-[#128C7E] dark:bg-[#202C33]">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft size={24} className="text-white" />
        </Link>
        <h1 className="text-xl font-semibold text-white">Contacts</h1>
      </div>
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
            ×
          </button>
        </div>
      )}
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696A0]" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setError('');
            }}
            placeholder="Search by name (e.g. Mani) or phone (e.g. 9876543210)"
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-[#3B4A54] focus:ring-2 focus:ring-[#128C7E] focus:border-transparent bg-white dark:bg-[#2A3942] text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 dark:placeholder-[#8696A0]"
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-[#8696A0]">
          Test users: Mani, Sarah, John, Priya, Rahul (all password: Test123)
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {searchQuery.trim().length >= 1 && (
          <div className="p-4 border-b border-gray-100 dark:border-[#2A3942]">
            <h3 className="text-sm font-medium text-gray-500 dark:text-[#8696A0] mb-2">Add new contact</h3>
            {loading ? (
              <div className="py-4 text-center text-gray-500 dark:text-[#8696A0]">Searching...</div>
            ) : searchToShow.length === 0 ? (
              <div className="py-4 text-center text-gray-500 dark:text-[#8696A0]">
                <p>No users found for &quot;{searchQuery}&quot;</p>
                <p className="text-xs mt-1">Run: <code className="bg-gray-100 dark:bg-[#2A3942] px-1 rounded">npm run seed</code> in apps/api to add test users</p>
              </div>
            ) : (
              <div className="space-y-1">
                {searchToShow.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2A3942]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] dark:text-[#00A884] font-bold">
                        {(u.name || '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-[#E9EDEF]">{u.name}</p>
                        <p className="text-sm text-gray-500 dark:text-[#8696A0]">{u.phone}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleAddContact(u.id)}
                        disabled={adding}
                        className="p-2 rounded-full bg-[#128C7E] text-white hover:bg-[#075E54] disabled:opacity-50"
                        title="Add contact"
                      >
                        <UserPlus size={18} />
                      </button>
                      <button
                        onClick={() => handleStartChat(u.id)}
                        disabled={adding}
                        className="p-2 rounded-full bg-[#128C7E]/20 text-[#128C7E] dark:text-[#00A884] hover:bg-[#128C7E]/30 disabled:opacity-50"
                        title="Start chat"
                      >
                        <MessageCircle size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-[#8696A0] mb-2">Your contacts ({contacts.length})</h3>
          {contacts.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-[#8696A0]">
              <UserPlus size={48} className="mx-auto mb-2 opacity-50" />
              <p>No contacts yet</p>
              <p className="text-sm mt-1">Search by name (Mani, Sarah) or phone (9876543210) above to add contacts</p>
              <Link to="/new-chat" className="mt-4 inline-block px-4 py-2 bg-[#128C7E] text-white rounded-lg text-sm font-medium hover:bg-[#075E54]">
                Or start a new chat
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[#2A3942]">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] rounded-lg px-2 -mx-2"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] dark:text-[#00A884] font-bold flex-shrink-0">
                      {(c.displayName || c.name || '?')[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 dark:text-[#E9EDEF] truncate">{c.displayName || c.name}</p>
                      <p className="text-sm text-gray-500 dark:text-[#8696A0] truncate">{c.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleStartChat(c.id)}
                      disabled={adding}
                      className="p-2 rounded-full hover:bg-[#128C7E]/10 text-[#128C7E] dark:text-[#00A884]"
                      title="Start chat"
                    >
                      <MessageCircle size={20} />
                    </button>
                    <button
                      onClick={() => handleRemoveContact(c.id)}
                      disabled={adding}
                      className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                      title="Remove contact"
                    >
                      <UserMinus size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
