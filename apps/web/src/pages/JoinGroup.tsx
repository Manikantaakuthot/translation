import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Users, Loader2, ArrowLeft, UserPlus, AlertCircle } from 'lucide-react';
import { groupsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface GroupPreview {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  memberCount?: number;
}

export default function JoinGroup() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuthStore();

  const [group, setGroup] = useState<GroupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!inviteCode) {
      setError('Invalid invite link');
      setLoading(false);
      return;
    }

    const fetchGroup = async () => {
      try {
        const { data } = await groupsApi.getByInviteCode(inviteCode);
        setGroup(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'This invite link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [inviteCode]);

  const handleJoin = async () => {
    if (!inviteCode || !accessToken) return;
    setJoining(true);
    try {
      const { data } = await groupsApi.joinByInviteCode(inviteCode);
      setJoined(true);
      // Navigate to the group chat after a brief delay
      setTimeout(() => {
        navigate(`/chat/${data.conversationId || data.id || ''}`);
      }, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to join group. You may already be a member.');
    } finally {
      setJoining(false);
    }
  };

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] dark:bg-[#0B141A] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#233138] rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
          <Users size={48} className="mx-auto text-[#128C7E] mb-4" />
          <h1 className="text-xl font-bold text-gray-800 dark:text-[#E9EDEF] mb-2">Group Invite</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Please sign in to join this group.
          </p>
          <Link
            to="/login"
            className="inline-block px-6 py-2.5 bg-[#128C7E] text-white font-semibold rounded-full hover:bg-[#075E54] transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F5] dark:bg-[#0B141A] flex flex-col">
      {/* Header */}
      <div className="bg-[#128C7E] px-4 py-3 flex items-center gap-3">
        <Link to="/" className="p-1.5 rounded-full hover:bg-white/15">
          <ArrowLeft size={22} className="text-white" />
        </Link>
        <h1 className="text-lg font-semibold text-white">Join Group</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={40} className="text-[#128C7E] animate-spin" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading group info...</p>
          </div>
        )}

        {error && !group && (
          <div className="bg-white dark:bg-[#233138] rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
            <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
            <h2 className="text-lg font-bold text-gray-800 dark:text-[#E9EDEF] mb-2">Oops!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error}</p>
            <Link
              to="/"
              className="inline-block px-6 py-2.5 bg-[#128C7E] text-white font-semibold rounded-full hover:bg-[#075E54]"
            >
              Go Home
            </Link>
          </div>
        )}

        {!loading && group && (
          <div className="bg-white dark:bg-[#233138] rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            {/* Group avatar */}
            <div className="bg-gradient-to-br from-[#128C7E] to-[#075E54] p-8 flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-3 overflow-hidden">
                {group.iconUrl ? (
                  <img src={group.iconUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Users size={36} className="text-white" />
                )}
              </div>
              <h2 className="text-xl font-bold text-white text-center">{group.name}</h2>
              {group.memberCount !== undefined && (
                <p className="text-sm text-white/70 mt-1">
                  {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="p-6">
              {group.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6 leading-relaxed">
                  {group.description}
                </p>
              )}

              {joined ? (
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-[#25D366] flex items-center justify-center mx-auto mb-3">
                    <UserPlus size={24} className="text-white" />
                  </div>
                  <p className="text-sm font-semibold text-[#128C7E]">Joined successfully!</p>
                  <p className="text-xs text-gray-400 mt-1">Redirecting to chat...</p>
                </div>
              ) : (
                <>
                  {error && (
                    <p className="text-sm text-red-500 text-center mb-4">{error}</p>
                  )}
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="w-full py-3 rounded-full bg-[#128C7E] text-white font-semibold hover:bg-[#075E54] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                  >
                    {joining ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <UserPlus size={18} />
                    )}
                    {joining ? 'Joining...' : 'Join Group'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
