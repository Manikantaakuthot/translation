import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Search, Users, Hash, Bell, BellOff, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useChannelStore, Channel } from '../store/channelStore';

export default function Channels() {
  const navigate = useNavigate();
  const { channels, loading, loadChannels, subscribeChannel, unsubscribeChannel } = useChannelStore();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const { createChannel } = useChannelStore();

  useEffect(() => {
    loadChannels();
  }, []);

  const filteredChannels = channels.filter(
    (ch) =>
      !search || ch.name.toLowerCase().includes(search.toLowerCase()) ||
      ch.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const ch = await createChannel({ name: createName.trim(), description: createDesc.trim() || undefined });
      if (ch) {
        setShowCreate(false);
        setCreateName('');
        setCreateDesc('');
        navigate(`/channel/${ch.id}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggleSubscription = async (ch: Channel) => {
    if (ch.isSubscribed) {
      await unsubscribeChannel(ch.id);
    } else {
      await subscribeChannel(ch.id);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] h-full">
      {/* Header */}
      <div className="bg-[#128C7E] dark:bg-[#202C33] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link to="/" className="p-1.5 -ml-1.5 rounded-full hover:bg-white/15">
          <ArrowLeft size={22} className="text-white" />
        </Link>
        <h1 className="text-lg font-semibold text-white flex-1">Channels</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="p-2 rounded-full hover:bg-white/15 text-white"
          title="Create Channel"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 bg-[#F0F2F5] dark:bg-[#111B21]">
        <div className="flex items-center bg-white dark:bg-[#2A3942] rounded-xl px-3 py-2 gap-2 shadow-sm">
          <Search size={16} className="text-[#54656F] dark:text-[#8696A0]" />
          <input
            type="text"
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent flex-1 text-sm text-gray-700 dark:text-[#E9EDEF] placeholder-[#8696A0] outline-none"
          />
        </div>
      </div>

      {/* Channel List */}
      <div className="flex-1 overflow-y-auto">
        {loading && channels.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="text-[#128C7E] animate-spin" />
          </div>
        )}

        {!loading && filteredChannels.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Hash size={48} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-[#8696A0]">
              {search ? 'No channels found' : 'No channels yet. Create one to get started!'}
            </p>
          </div>
        )}

        {filteredChannels.map((ch) => (
          <div
            key={ch.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-[#F5F6F6] dark:hover:bg-[#2A3942] cursor-pointer border-b border-[#F0F2F5] dark:border-[#2A3942] transition-colors"
            onClick={() => navigate(`/channel/${ch.id}`)}
          >
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#128C7E] to-[#25D366] flex items-center justify-center flex-shrink-0">
              {ch.iconUrl ? (
                <img src={ch.iconUrl} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <Hash size={22} className="text-white" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">{ch.name}</h3>
              </div>
              <p className="text-xs text-[#667781] dark:text-[#8696A0] truncate mt-0.5">
                {ch.description || `${ch.subscriberCount} subscriber${ch.subscriberCount !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Subscribe button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSubscription(ch);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                ch.isSubscribed
                  ? 'bg-gray-100 dark:bg-[#2A3942] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#3B4A54]'
                  : 'bg-[#128C7E] text-white hover:bg-[#075E54]'
              }`}
            >
              {ch.isSubscribed ? (
                <>
                  <BellOff size={12} />
                  Joined
                </>
              ) : (
                <>
                  <Bell size={12} />
                  Join
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Create Channel Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-[#233138] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 bg-[#128C7E] flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Create Channel</span>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-full hover:bg-white/20 text-white">
                <ArrowLeft size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Channel name"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2A3942] text-sm text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#128C7E]/40"
                autoFocus
              />
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2A3942] text-sm text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#128C7E]/40 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2A3942]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createName.trim() || creating}
                  className="flex-1 py-2.5 rounded-full bg-[#128C7E] text-white text-sm font-semibold hover:bg-[#075E54] disabled:opacity-40"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
