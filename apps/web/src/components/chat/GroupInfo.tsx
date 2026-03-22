import { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus, LogOut, Link2, Copy, Check, Pencil, Shield } from 'lucide-react';
import { groupsApi, usersApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

interface Props {
  groupId: string;
  onClose: () => void;
}

export default function GroupInfo({ groupId, onClose }: Props) {
  const [group, setGroup] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    groupsApi.get(groupId).then(({ data }) => {
      setGroup(data);
      if (data.inviteCode) {
        setInviteLink(`${window.location.origin}/join/${data.inviteCode}`);
      }
    }).catch(() => onClose());
  }, [groupId]);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    usersApi.search(searchQuery).then(({ data }) => setSearchResults(Array.isArray(data) ? data : [])).catch(() => setSearchResults([]));
  }, [searchQuery]);

  const isAdmin = (group?.participants || []).find((p: any) => p.userId === user?.id)?.role === 'admin';
  const participants = Array.isArray(group?.participants) ? group.participants : [];
  const nonMembers = (Array.isArray(searchResults) ? searchResults : []).filter((u) => !participants.some((p: any) => p.userId === u.id));

  const handleAddMember = async (userId: string) => {
    try {
      const { data } = await groupsApi.addMember(groupId, userId);
      setGroup(data);
      setSearchQuery('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    try {
      const { data } = await groupsApi.removeMember(groupId, userId);
      setGroup(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return;
    setLeavingGroup(true);
    try {
      await groupsApi.leave(groupId);
      onClose();
      navigate('/');
    } catch (err) {
      console.error('Failed to leave group:', err);
    } finally {
      setLeavingGroup(false);
    }
  };

  const handleGenerateInviteLink = async () => {
    try {
      const { data } = await groupsApi.generateInviteLink(groupId);
      const link = `${window.location.origin}/join/${data.inviteCode}`;
      setInviteLink(link);
    } catch (err) {
      console.error('Failed to generate invite link:', err);
    }
  };

  const handleRevokeInviteLink = async () => {
    if (!confirm('Revoke this invite link? The current link will stop working.')) return;
    try {
      await groupsApi.revokeInviteLink(groupId);
      setInviteLink(null);
    } catch (err) {
      console.error('Failed to revoke invite link:', err);
    }
  };

  const copyInviteLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const handleSaveDescription = async () => {
    try {
      await groupsApi.update(groupId, { description: descDraft.trim() });
      setGroup((g: any) => ({ ...g, description: descDraft.trim() }));
      setEditingDesc(false);
    } catch (err) {
      console.error('Failed to update description:', err);
    }
  };

  if (!group) return null;

  return (
    <div className="absolute inset-0 bg-white dark:bg-[#111B21] z-10 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] flex items-center justify-between bg-[#F0F2F5] dark:bg-[#202C33]">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-[#E9EDEF]">Group Info</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942]">
          <X size={24} className="text-gray-600 dark:text-[#8696A0]" />
        </button>
      </div>

      {/* Group header */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942]">
        <div className="w-20 h-20 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] text-2xl font-bold mx-auto mb-2">
          {group.name?.[0]?.toUpperCase() || '?'}
        </div>
        <h3 className="text-center font-semibold text-lg text-gray-800 dark:text-[#E9EDEF]">{group.name}</h3>
        <p className="text-center text-xs text-[#8696A0] mt-0.5">{participants.length} participants</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Description section */}
        <div className="p-4 border-b border-gray-200 dark:border-[#2A3942]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-[#128C7E] uppercase tracking-wider">Description</h4>
            {isAdmin && !editingDesc && (
              <button
                onClick={() => { setEditingDesc(true); setDescDraft(group.description || ''); }}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#2A3942] text-gray-400"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2A3942] text-sm text-gray-800 dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[#128C7E]/40 resize-none"
                rows={3}
                placeholder="Add group description..."
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setEditingDesc(false)} className="flex-1 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2A3942]">Cancel</button>
                <button onClick={handleSaveDescription} className="flex-1 py-1.5 rounded-lg text-sm bg-[#128C7E] text-white hover:bg-[#075E54]">Save</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-[#8696A0]">
              {group.description || 'No description'}
            </p>
          )}
        </div>

        {/* Invite link section */}
        {isAdmin && (
          <div className="p-4 border-b border-gray-200 dark:border-[#2A3942]">
            <h4 className="text-xs font-semibold text-[#128C7E] uppercase tracking-wider mb-3">Invite Link</h4>
            {inviteLink ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-[#F0F2F5] dark:bg-[#2A3942] rounded-lg px-3 py-2">
                  <Link2 size={14} className="text-[#128C7E] flex-shrink-0" />
                  <p className="text-xs text-gray-600 dark:text-[#8696A0] truncate flex-1 font-mono">{inviteLink}</p>
                  <button
                    onClick={copyInviteLink}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#3B4A54] text-[#128C7E]"
                    title="Copy link"
                  >
                    {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <button
                  onClick={handleRevokeInviteLink}
                  className="text-xs text-red-500 hover:text-red-600 font-medium"
                >
                  Revoke link
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateInviteLink}
                className="flex items-center gap-2 text-sm text-[#128C7E] font-medium hover:text-[#075E54]"
              >
                <Link2 size={16} />
                Generate invite link
              </button>
            )}
          </div>
        )}

        {/* Members list */}
        <div className="p-4">
          <h4 className="text-xs font-semibold text-[#128C7E] uppercase tracking-wider mb-3">
            Members ({participants.length})
          </h4>
          <div className="space-y-1">
            {participants.map((p: any) => (
              <div
                key={p.userId}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-[#F5F6F6] dark:hover:bg-[#2A3942]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] font-bold flex-shrink-0">
                    {(p.name || '?')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-800 dark:text-[#E9EDEF]">
                      {p.name}
                      {p.userId === user?.id && <span className="text-xs text-[#8696A0] ml-1">(You)</span>}
                    </p>
                    {p.role === 'admin' && (
                      <p className="text-[10px] text-[#128C7E] font-medium flex items-center gap-1">
                        <Shield size={10} /> Admin
                      </p>
                    )}
                  </div>
                </div>
                {isAdmin && p.userId !== user?.id && (
                  <button
                    onClick={() => handleRemoveMember(p.userId)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
                    title="Remove member"
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add member (admin only) */}
          {isAdmin && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-[#128C7E] uppercase tracking-wider mb-2">Add member</h4>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2A3942] text-sm text-gray-800 dark:text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#128C7E]/40 mb-2"
              />
              <div className="space-y-1">
                {nonMembers.slice(0, 5).map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-[#F5F6F6] dark:hover:bg-[#2A3942]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-[#2A3942] flex items-center justify-center font-bold text-gray-600 dark:text-gray-400">
                        {(u.name || '?')[0]?.toUpperCase()}
                      </div>
                      <p className="font-medium text-sm text-gray-800 dark:text-[#E9EDEF]">{u.name}</p>
                    </div>
                    <button
                      onClick={() => handleAddMember(u.id)}
                      className="p-2 text-[#128C7E] hover:bg-[#128C7E]/10 rounded-full"
                      title="Add member"
                    >
                      <UserPlus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Leave Group button */}
      <div className="p-4 border-t border-gray-200 dark:border-[#2A3942]">
        <button
          onClick={handleLeaveGroup}
          disabled={leavingGroup}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition font-medium disabled:opacity-50"
        >
          <LogOut size={18} />
          {leavingGroup ? 'Leaving...' : 'Leave Group'}
        </button>
      </div>
    </div>
  );
}
