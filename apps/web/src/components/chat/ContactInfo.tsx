import { useState, useEffect } from 'react';
import {
  X,
  Search,
  UserPlus,
  UserCheck,
  Image,
  Star,
  Bell,
  BellOff,
  Clock,
  Shield,
  Lock,
  Ban,
  Flag,
  Trash2,
  Users,
  ChevronRight,
} from 'lucide-react';
import { usersApi, messagesApi, conversationsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';

interface Props {
  conversationId: string;
  userId: string; // the other user's ID
  onClose: () => void;
}

interface UserProfile {
  id: string;
  name: string;
  phone: string;
  profilePictureUrl?: string;
  statusText?: string;
  lastSeen?: string;
  isOnline?: boolean;
}

interface MediaItem {
  id: string;
  type: string;
  mediaUrl?: string;
  content?: string;
  createdAt: string;
}

interface CommonGroup {
  id: string;
  name: string;
  participantCount: number;
}

export default function ContactInfo({ conversationId, userId, onClose }: Props) {
  const { user } = useAuthStore();
  const { updateConversation } = useChatStore();
  const conversations = useChatStore((s) => s.conversations);
  const conv = (conversations || []).find((c) => c.id === conversationId);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [commonGroups, setCommonGroups] = useState<CommonGroup[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(conv?.isMuted || false);
  const [isSavedContact, setIsSavedContact] = useState<boolean | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [addingContact, setAddingContact] = useState(false);

  useEffect(() => {
    usersApi.getById(userId).then(({ data }) => {
      setProfile(data);
      setContactName(data.name || '');
    }).catch(() => {});
    messagesApi.getMedia(conversationId, 20).then(({ data }) => {
      setMedia(Array.isArray(data) ? data : []);
    }).catch(() => {});
    usersApi.getCommonGroups(userId).then(({ data }) => {
      setCommonGroups(Array.isArray(data) ? data : []);
    }).catch(() => {});
    // Check if this user is already a saved contact
    usersApi.getContacts().then(({ data }) => {
      const contacts = Array.isArray(data) ? data : [];
      const found = contacts.some((c: any) => c.id === userId);
      setIsSavedContact(found);
    }).catch(() => setIsSavedContact(false));
  }, [userId, conversationId]);

  const handleMuteToggle = async () => {
    try {
      await conversationsApi.mute(conversationId, !isMuted);
      setIsMuted(!isMuted);
      updateConversation(conversationId, { isMuted: !isMuted });
    } catch {}
  };

  const handleBlock = async () => {
    if (!confirm(`Block ${profile?.name || 'this contact'}?`)) return;
    try {
      if (isBlocked) {
        await usersApi.unblockContact(userId);
        setIsBlocked(false);
      } else {
        await usersApi.blockContact(userId);
        setIsBlocked(true);
      }
    } catch {}
  };

  const handleReport = () => {
    alert(`Reported ${profile?.name || 'this contact'}. Thank you for your feedback.`);
  };

  const handleDeleteChat = async () => {
    if (!confirm('Delete this chat? Messages will be removed from your device.')) return;
    try {
      await conversationsApi.archive(conversationId, true);
      updateConversation(conversationId, { isArchived: true });
      onClose();
    } catch {}
  };

  const handleAddContact = async () => {
    if (!contactName.trim()) return;
    setAddingContact(true);
    try {
      await usersApi.addContact(userId, contactName.trim());
      setIsSavedContact(true);
      setShowAddForm(false);
    } catch {
    } finally {
      setAddingContact(false);
    }
  };

  if (!profile) {
    return (
      <div className="h-full bg-white dark:bg-[#111B21] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-gray-300 dark:border-gray-600 border-t-[#128C7E] dark:border-t-[#00A884] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-[#111B21] flex flex-col text-gray-900 dark:text-white overflow-hidden">
      {/* Header */}
      <div className="bg-[#F0F2F5] dark:bg-[#202C33] px-4 py-3 flex items-center gap-4 border-b border-gray-200 dark:border-[#2A3942]">
        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-[#2A3942]">
          <X size={24} className="text-gray-500 dark:text-[#AEBAC1]" />
        </button>
        <h2 className="text-lg font-medium text-gray-800 dark:text-[#E9EDEF]">Contact info</h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile section */}
        <div className="bg-white dark:bg-[#111B21] flex flex-col items-center py-7 px-4">
          {profile.profilePictureUrl ? (
            <img
              src={profile.profilePictureUrl}
              alt={profile.name}
              className="w-[200px] h-[200px] rounded-full object-cover mb-4"
            />
          ) : (
            <div className="w-[200px] h-[200px] rounded-full bg-gray-200 dark:bg-[#2A3942] flex items-center justify-center text-[#AEBAC1] text-6xl font-light mb-4">
              {profile.name[0]?.toUpperCase() || '?'}
            </div>
          )}
          <h3 className="text-[22px] font-normal text-gray-800 dark:text-[#E9EDEF]">{profile.name}</h3>
          <p className="text-gray-500 dark:text-[#8696A0] text-base mt-1">{profile.phone}</p>
        </div>

        {/* Not saved contact banner */}
        {isSavedContact === false && !showAddForm && (
          <div className="bg-white dark:bg-[#111B21] px-6 pb-4">
            <div className="bg-gray-50 dark:bg-[#202C33] rounded-xl p-4 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-gray-800 dark:text-[#E9EDEF] text-sm font-medium">Not a contact</p>
                <p className="text-gray-500 dark:text-[#8696A0] text-xs mt-0.5">{profile.phone} is not in your contacts</p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-[#00A884] text-white text-sm font-medium rounded-lg hover:bg-[#06CF9C] flex items-center gap-2"
              >
                <UserPlus size={16} />
                Add
              </button>
            </div>
          </div>
        )}

        {/* Add contact form */}
        {showAddForm && (
          <div className="bg-white dark:bg-[#111B21] px-6 pb-4">
            <div className="bg-gray-50 dark:bg-[#202C33] rounded-xl p-4">
              <p className="text-gray-800 dark:text-[#E9EDEF] text-sm font-medium mb-3">Save contact</p>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name"
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#2A3942] text-gray-800 dark:text-[#E9EDEF] rounded-lg border border-gray-300 dark:border-[#3B4A54] focus:border-[#00A884] focus:outline-none text-sm placeholder-gray-400 dark:placeholder-[#8696A0] mb-3"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-gray-500 dark:text-[#8696A0] text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A3942]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddContact}
                  disabled={!contactName.trim() || addingContact}
                  className="px-4 py-2 bg-[#00A884] text-white text-sm font-medium rounded-lg hover:bg-[#06CF9C] disabled:opacity-50 flex items-center gap-2"
                >
                  {addingContact ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="bg-white dark:bg-[#111B21] flex justify-center gap-6 pb-5">
          <button className="flex flex-col items-center gap-2 px-6 py-3 rounded-xl bg-gray-50 dark:bg-[#202C33] hover:bg-gray-100 dark:hover:bg-[#2A3942] min-w-[100px]">
            <Search size={22} className="text-[#00A884]" />
            <span className="text-xs text-gray-500 dark:text-[#8696A0]">Search</span>
          </button>
          {isSavedContact ? (
            <div className="flex flex-col items-center gap-2 px-6 py-3 rounded-xl bg-gray-50 dark:bg-[#202C33] min-w-[100px] opacity-70">
              <UserCheck size={22} className="text-[#00A884]" />
              <span className="text-xs text-gray-500 dark:text-[#8696A0]">Saved</span>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex flex-col items-center gap-2 px-6 py-3 rounded-xl bg-gray-50 dark:bg-[#202C33] hover:bg-gray-100 dark:hover:bg-[#2A3942] min-w-[100px]"
            >
              <UserPlus size={22} className="text-[#00A884]" />
              <span className="text-xs text-gray-500 dark:text-[#8696A0]">Add</span>
            </button>
          )}
        </div>

        <div className="h-2 bg-gray-100 dark:bg-[#0B141A]" />

        {/* About */}
        <div className="bg-white dark:bg-[#111B21] px-6 py-4">
          <p className="text-gray-500 dark:text-[#8696A0] text-sm mb-1">About</p>
          <p className="text-gray-800 dark:text-[#E9EDEF] text-base">{profile.statusText || 'Hey there! I am using MQ'}</p>
        </div>

        <div className="h-2 bg-gray-100 dark:bg-[#0B141A]" />

        {/* Media, links and docs */}
        <button className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#202C33]">
          <div className="flex items-center gap-4">
            <Image size={20} className="text-gray-400 dark:text-[#8696A0]" />
            <span className="text-gray-800 dark:text-[#E9EDEF]">Media, links and docs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-[#8696A0] text-sm">{media.length}</span>
            <ChevronRight size={18} className="text-gray-400 dark:text-[#8696A0]" />
          </div>
        </button>

        {/* Media thumbnails */}
        {media.length > 0 && (
          <div className="bg-white dark:bg-[#111B21] px-6 pb-4 grid grid-cols-4 gap-1">
            {media.slice(0, 4).map((item) => (
              <div key={item.id} className="aspect-square bg-gray-100 dark:bg-[#2A3942] rounded overflow-hidden">
                {item.mediaUrl && (item.type === 'image' || item.type === 'video') ? (
                  <img src={item.mediaUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-[#8696A0] text-xs">
                    {item.type}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="h-2 bg-gray-100 dark:bg-[#0B141A]" />

        {/* Starred messages */}
        <button className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#202C33]">
          <div className="flex items-center gap-4">
            <Star size={20} className="text-gray-400 dark:text-[#8696A0]" />
            <span className="text-gray-800 dark:text-[#E9EDEF]">Starred messages</span>
          </div>
          <ChevronRight size={18} className="text-gray-400 dark:text-[#8696A0]" />
        </button>

        <div className="h-2 bg-gray-100 dark:bg-[#0B141A]" />

        {/* Mute notifications */}
        <button
          onClick={handleMuteToggle}
          className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#202C33]"
        >
          <div className="flex items-center gap-4">
            {isMuted ? <BellOff size={20} className="text-gray-400 dark:text-[#8696A0]" /> : <Bell size={20} className="text-gray-400 dark:text-[#8696A0]" />}
            <span className="text-gray-800 dark:text-[#E9EDEF]">Mute notifications</span>
          </div>
          <div
            className={`w-10 h-6 rounded-full relative transition-colors ${
              isMuted ? 'bg-[#00A884]' : 'bg-gray-300 dark:bg-[#3B4A54]'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                isMuted ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </div>
        </button>

        {/* Disappearing messages */}
        <button className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#202C33]">
          <div className="flex items-center gap-4">
            <Clock size={20} className="text-gray-400 dark:text-[#8696A0]" />
            <div className="text-left">
              <span className="text-gray-800 dark:text-[#E9EDEF] block">Disappearing messages</span>
              <span className="text-gray-500 dark:text-[#8696A0] text-sm">Off</span>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400 dark:text-[#8696A0]" />
        </button>

        {/* Advanced chat privacy */}
        <button className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#202C33]">
          <div className="flex items-center gap-4">
            <Shield size={20} className="text-gray-400 dark:text-[#8696A0]" />
            <div className="text-left">
              <span className="text-gray-800 dark:text-[#E9EDEF] block">Advanced chat privacy</span>
              <span className="text-gray-500 dark:text-[#8696A0] text-sm">Off</span>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400 dark:text-[#8696A0]" />
        </button>

        <div className="h-2 bg-gray-100 dark:bg-[#0B141A]" />

        {/* Encryption */}
        <button className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-[#202C33]">
          <Lock size={20} className="text-gray-400 dark:text-[#8696A0]" />
          <div className="text-left flex-1">
            <span className="text-gray-800 dark:text-[#E9EDEF] block">Encryption</span>
            <span className="text-gray-500 dark:text-[#8696A0] text-sm">Messages are end-to-end encrypted. Click to verify.</span>
          </div>
        </button>

        <div className="h-2 bg-gray-100 dark:bg-[#0B141A]" />

        {/* Common groups */}
        {commonGroups.length > 0 && (
          <>
            <div className="bg-white dark:bg-[#111B21] px-6 py-3">
              <p className="text-gray-500 dark:text-[#8696A0] text-sm">
                {commonGroups.length} group{commonGroups.length !== 1 ? 's' : ''} in common
              </p>
            </div>
            {commonGroups.map((group) => (
              <div
                key={group.id}
                className="bg-white dark:bg-[#111B21] px-6 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-[#202C33]"
              >
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-[#2A3942] flex items-center justify-center">
                  <Users size={22} className="text-gray-400 dark:text-[#8696A0]" />
                </div>
                <div>
                  <p className="text-gray-800 dark:text-[#E9EDEF] font-normal">{group.name}</p>
                  <p className="text-gray-500 dark:text-[#8696A0] text-sm">{group.participantCount} members</p>
                </div>
              </div>
            ))}
            <div className="h-2 bg-gray-100 dark:bg-[#0B141A]" />
          </>
        )}

        {/* Block */}
        <button
          onClick={handleBlock}
          className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-[#202C33]"
        >
          <Ban size={20} className="text-[#EA0038]" />
          <span className="text-[#EA0038]">
            {isBlocked ? 'Unblock' : 'Block'} {profile.name}
          </span>
        </button>

        {/* Report */}
        <button
          onClick={handleReport}
          className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-[#202C33]"
        >
          <Flag size={20} className="text-[#EA0038]" />
          <span className="text-[#EA0038]">Report {profile.name}</span>
        </button>

        {/* Delete chat */}
        <button
          onClick={handleDeleteChat}
          className="w-full bg-white dark:bg-[#111B21] px-6 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-[#202C33] mb-4"
        >
          <Trash2 size={20} className="text-[#EA0038]" />
          <span className="text-[#EA0038]">Delete chat</span>
        </button>
      </div>
    </div>
  );
}
