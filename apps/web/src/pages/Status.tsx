import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, PencilLine } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { statusApi, conversationsApi } from '../api/client';
import { useChatStore } from '../store/chatStore';
import StatusViewer from '../components/status/StatusViewer';

interface StatusItem {
  id: string;
  type: string;
  content?: string;
  mediaUrl?: string;
  backgroundColor?: string;
  createdAt: string;
  viewedByMe: boolean;
  viewerCount?: number;
  viewers?: { userId: string; viewedAt: string }[];
}

interface StatusUser {
  userId: string;
  userName: string;
  profilePictureUrl?: string;
  allViewed: boolean;
  statuses: StatusItem[];
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return 'Yesterday';
}

function StatusRing({
  profilePictureUrl,
  name,
  allViewed,
  isMine,
  hasStatuses,
  size = 'md',
}: {
  profilePictureUrl?: string;
  name: string;
  allViewed: boolean;
  isMine?: boolean;
  hasStatuses?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';

  let ringClass = '';
  if (isMine && hasStatuses) {
    ringClass = 'ring-2 ring-[#25D366] ring-offset-2 dark:ring-offset-[#111B21]';
  } else if (!isMine && !allViewed) {
    ringClass = 'ring-2 ring-[#25D366] ring-offset-2 dark:ring-offset-[#111B21]';
  } else if (!isMine && allViewed) {
    ringClass = 'ring-2 ring-gray-300 dark:ring-[#8696A0] ring-offset-2 dark:ring-offset-[#111B21]';
  }

  return (
    <div
      className={`${dim} rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] dark:text-[#00A884] font-bold overflow-hidden flex-shrink-0 ${ringClass}`}
    >
      {profilePictureUrl ? (
        <img src={profilePictureUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={textSize}>{name[0]?.toUpperCase() || '?'}</span>
      )}
    </div>
  );
}

export default function Status() {
  const [feed, setFeed] = useState<StatusUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ user: StatusUser; index: number } | null>(null);
  const { user } = useAuthStore();

  const loadFeed = useCallback(() => {
    statusApi
      .feed()
      .then(({ data }) => setFeed(Array.isArray(data) ? data : []))
      .catch(() => setFeed([]))
      .finally(() => setLoading(false));
  }, []);

  const navigate = useNavigate();
  const { sendMessage } = useChatStore();

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Real-time: listen for status:created / status:deleted events
  useEffect(() => {
    const handler = () => loadFeed();
    window.addEventListener('status:refresh', handler);
    return () => window.removeEventListener('status:refresh', handler);
  }, [loadFeed]);

  // Polling fallback: refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadFeed, 30000);
    return () => clearInterval(interval);
  }, [loadFeed]);

  const myStatuses = feed.find((f) => f.userId === user?.id);
  const others = feed.filter((f) => f.userId !== user?.id);
  const recentUpdates = others.filter((u) => !u.allViewed);
  const viewedUpdates = others.filter((u) => u.allViewed);

  const openViewer = (statusUser: StatusUser, index = 0) => {
    setSelected({ user: statusUser, index });
    const firstStatus = statusUser.statuses[index];
    if (firstStatus && statusUser.userId !== user?.id) {
      statusApi.markViewed(firstStatus.id).catch(() => {});
    }
  };

  const handleViewerNext = () => {
    if (!selected) return;
    const nextIndex = selected.index + 1;
    if (nextIndex < selected.user.statuses.length) {
      const nextStatus = selected.user.statuses[nextIndex];
      if (selected.user.userId !== user?.id) {
        statusApi.markViewed(nextStatus.id).catch(() => {});
      }
      setSelected({ user: selected.user, index: nextIndex });
    } else {
      setSelected(null);
      loadFeed();
    }
  };

  const handleViewerClose = () => {
    setSelected(null);
    loadFeed();
  };

  const handleDeleteStatus = (statusId: string) => {
    statusApi
      .delete(statusId)
      .then(() => loadFeed())
      .catch(() => {});
  };

  const handleReply = async (targetUserId: string, message: string, _statusId: string) => {
    try {
      // Get or create a direct conversation with the status poster
      const { data: conv } = await conversationsApi.getOrCreateDirect(targetUserId);
      const conversationId = conv.id || conv._id;
      // Send the reply as a message
      await sendMessage(conversationId, `↩️ Replied to your status: ${message}`, {});
      // Navigate to the conversation
      setSelected(null);
      navigate(`/chat/${conversationId}`);
    } catch (err) {
      console.error('[Status] Failed to send reply:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F0F2F5] dark:bg-[#111B21] w-full h-full overflow-y-auto">
      {/* My Status */}
      <div className="bg-white dark:bg-[#202C33] mb-2">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <StatusRing
              profilePictureUrl={user?.profilePictureUrl}
              name={user?.name || '?'}
              allViewed={false}
              isMine
              hasStatuses={!!myStatuses?.statuses?.length}
              size="lg"
            />
            <Link
              to="/status/new"
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#25D366] rounded-full flex items-center justify-center border-2 border-white dark:border-[#202C33]"
            >
              <Plus size={10} className="text-white" strokeWidth={3} />
            </Link>
          </div>

          <div className="flex-1 min-w-0">
            {myStatuses?.statuses?.length ? (
              <button
                onClick={() => openViewer(myStatuses, 0)}
                className="text-left w-full"
              >
                <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">My status</p>
                <p className="text-sm text-gray-500 dark:text-[#8696A0]">
                  {myStatuses.statuses.length} update{myStatuses.statuses.length > 1 ? 's' : ''} ·{' '}
                  {relativeTime(myStatuses.statuses[myStatuses.statuses.length - 1].createdAt)}
                </p>
              </button>
            ) : (
              <Link to="/status/new" className="block">
                <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">My status</p>
                <p className="text-sm text-gray-500 dark:text-[#8696A0]">Tap to add status update</p>
              </Link>
            )}
          </div>

          <Link
            to="/status/new"
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#2A3942] text-[#54656F] dark:text-[#8696A0]"
            title="Add status"
          >
            <PencilLine size={20} />
          </Link>
        </div>
      </div>

      {/* Recent Updates - Loading */}
      {loading && (
        <div className="bg-white dark:bg-[#202C33] mx-0">
          <p className="px-4 pt-4 pb-2 text-xs font-semibold text-[#54656F] dark:text-[#8696A0] uppercase tracking-wide">
            Recent updates
          </p>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-[#2A3942] flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-200 dark:bg-[#2A3942] rounded w-1/2" />
                <div className="h-3 bg-gray-100 dark:bg-[#202C33] rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Updates */}
      {!loading && recentUpdates.length > 0 && (
        <div className="bg-white dark:bg-[#202C33] mb-2">
          <p className="px-4 pt-4 pb-2 text-xs font-semibold text-[#54656F] dark:text-[#8696A0] uppercase tracking-wide">
            Recent updates
          </p>
          <div>
            {recentUpdates.map((u) => (
              <button
                key={u.userId}
                onClick={() => openViewer(u, 0)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
              >
                <StatusRing
                  profilePictureUrl={u.profilePictureUrl}
                  name={u.userName}
                  allViewed={u.allViewed}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-[#E9EDEF] truncate">{u.userName}</p>
                  <p className="text-xs text-gray-500 dark:text-[#8696A0]">
                    {relativeTime(u.statuses[u.statuses.length - 1]?.createdAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Viewed Updates */}
      {!loading && viewedUpdates.length > 0 && (
        <div className="bg-white dark:bg-[#202C33] mb-2">
          <p className="px-4 pt-4 pb-2 text-xs font-semibold text-[#54656F] dark:text-[#8696A0] uppercase tracking-wide">
            Viewed updates
          </p>
          <div>
            {viewedUpdates.map((u) => (
              <button
                key={u.userId}
                onClick={() => openViewer(u, 0)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left opacity-70"
              >
                <StatusRing
                  profilePictureUrl={u.profilePictureUrl}
                  name={u.userName}
                  allViewed={u.allViewed}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 dark:text-[#E9EDEF] truncate">{u.userName}</p>
                  <p className="text-xs text-gray-400 dark:text-[#8696A0]">
                    {relativeTime(u.statuses[u.statuses.length - 1]?.createdAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && recentUpdates.length === 0 && viewedUpdates.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
          <div className="w-20 h-20 rounded-full bg-[#128C7E]/10 flex items-center justify-center mb-4">
            <Plus size={32} className="text-[#128C7E] dark:text-[#00A884]" />
          </div>
          <p className="text-gray-700 dark:text-[#E9EDEF] font-medium mb-1">No status updates</p>
          <p className="text-sm text-gray-500 dark:text-[#8696A0]">
            Status updates from your contacts will appear here. Tap the pencil to share yours.
          </p>
        </div>
      )}

      {/* StatusViewer */}
      {selected && (
        <StatusViewer
          user={selected.user}
          initialIndex={selected.index}
          currentUserId={user?.id || ''}
          onClose={handleViewerClose}
          onNext={handleViewerNext}
          onPrev={() => {
            if (!selected) return;
            if (selected.index > 0) {
              setSelected({ user: selected.user, index: selected.index - 1 });
            } else {
              setSelected(null);
            }
          }}
          onDelete={handleDeleteStatus}
          onReply={handleReply}
        />
      )}
    </div>
  );
}
