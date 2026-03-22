import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import type { Conversation } from '../../store/chatStore';

interface Props {
  conversation: Conversation;
  isSelected: boolean;
  currentUserId: string;
}

function getLastMessagePreview(conversation: Conversation, currentUserId: string): string {
  const lm = conversation.lastMessage;
  if (!lm) return '';
  if ((lm as any).isDeleted) return '🚫 This message was deleted';
  const isGroup = conversation.type === 'group';
  const isOwn = (lm as any).senderId === currentUserId;
  let prefix = '';
  if (isGroup) {
    prefix = isOwn ? 'You: ' : lm.senderName ? `${lm.senderName}: ` : '';
  } else if (isOwn) {
    prefix = '';
  }
  switch (lm.type) {
    case 'image':    return `${prefix}📷 Photo`;
    case 'video':    return `${prefix}🎥 Video`;
    case 'voice':
    case 'audio':    return `${prefix}🎤 Voice message`;
    case 'document': return `${prefix}📄 Document`;
    default:         return `${prefix}${lm.content || ''}`;
  }
}

export default function ChatListItem({ conversation, isSelected, currentUserId }: Props) {
  const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
  const otherParticipant = participants.find((p) => p.userId !== currentUserId);
  const displayName = conversation.name || otherParticipant?.name || 'Unknown';
  const avatarSrc = conversation.type === 'group' ? null : otherParticipant?.profilePictureUrl;
  const isOnline = conversation.type === 'direct' && otherParticipant?.isOnline;

  const lastUpdate = conversation.lastMessage?.createdAt
    ? format(new Date(conversation.lastMessage.createdAt), 'HH:mm')
    : conversation.updatedAt
    ? format(new Date(conversation.updatedAt), 'HH:mm')
    : '';

  const preview = getLastMessagePreview(conversation, currentUserId);
  const unread = conversation.unreadCount ?? 0;
  const isMuted = conversation.isMuted;

  return (
    <Link
      to={`/chat/${conversation.id}`}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-[#F5F6F6] dark:hover:bg-[#2A3942] transition-colors ${
        isSelected ? 'bg-[#F0F2F5] dark:bg-[#2A3942]' : 'bg-white dark:bg-[#111B21]'
      }`}
    >
      {/* Avatar with online indicator */}
      <div className="relative flex-shrink-0">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            className="w-[50px] h-[50px] rounded-full object-cover"
          />
        ) : (
          <div className="w-[50px] h-[50px] rounded-full bg-[#DFE5E7] dark:bg-[#2A3942] flex items-center justify-center text-[#54656F] dark:text-[#8696A0] font-semibold text-xl select-none">
            {displayName[0]?.toUpperCase() || '?'}
          </div>
        )}
        {isOnline && (
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-[#25D366] border-2 border-white dark:border-[#111B21]" />
        )}
      </div>

      {/* Content + bottom divider */}
      <div className="flex-1 min-w-0 border-b border-[#F0F2F5] dark:border-[#2A3942] pb-3 -mb-3">
        <div className="flex justify-between items-baseline gap-1">
          <h3 className={`font-medium truncate ${unread > 0 ? 'text-[#111B21] dark:text-[#E9EDEF]' : 'text-[#111B21] dark:text-[#E9EDEF]'}`}>
            {displayName}
          </h3>
          <span className={`text-[11px] flex-shrink-0 ${unread > 0 ? 'text-[#25D366]' : 'text-[#667781] dark:text-[#8696A0]'}`}>
            {lastUpdate}
          </span>
        </div>
        <div className="flex justify-between items-center mt-0.5 gap-1">
          <p className={`text-sm truncate flex-1 ${unread > 0 ? 'text-[#111B21] dark:text-[#E9EDEF]' : 'text-[#667781] dark:text-[#8696A0]'}`}>
            {preview || <span className="italic text-[#667781] dark:text-[#8696A0]">Tap to open chat</span>}
          </p>
          {unread > 0 ? (
            <span className={`flex-shrink-0 text-white text-[11px] font-semibold rounded-full w-5 h-5 flex items-center justify-center ${isMuted ? 'bg-[#8696A0]' : 'bg-[#25D366]'}`}>
              {unread > 99 ? '99+' : unread}
            </span>
          ) : isMuted ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8696A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
