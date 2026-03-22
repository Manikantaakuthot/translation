import { useEffect, useRef } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import type { Message } from '../../store/chatStore';
import MessageBubble from './MessageBubble';

interface Props {
  messages: Message[];
  currentUserId: string;
  isGroup?: boolean;
  onVisible?: (conversationId: string, messageIds: string[]) => void;
  onForward?: (message: Message) => void;
  onDelete?: (message: Message, deleteForEveryone: boolean) => void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onStar?: (message: Message) => void;
  onPin?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onProfileClick?: (userId: string) => void;
  highlightedMessageId?: string;
  searchQuery?: string;
  wallpaper?: string;
}

function getDateLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

// Messages within 2 min from same sender are grouped (less vertical space between them)
const GROUP_TIME_MS = 2 * 60 * 1000;

export default function MessageList({ messages, currentUserId, isGroup, onVisible, onForward, onDelete, onReply, onReact, onStar, onPin, onEdit, onProfileClick, highlightedMessageId, searchQuery, wallpaper }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Scroll to highlighted (search result) message
  useEffect(() => {
    if (!highlightedMessageId || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-msg-id="${highlightedMessageId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedMessageId]);

  useEffect(() => {
    if (!onVisible || messages.length === 0) return;
    const convId = messages[0]?.conversationId;
    const unread = (Array.isArray(messages) ? messages : []).filter(
      (m) => m.senderId !== currentUserId && !(m.status?.read?.length)
    );
    if (unread.length > 0 && convId) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            onVisible(convId, unread.map((m) => m.id));
          }
        },
        { threshold: 0.5 }
      );
      const last = containerRef.current?.querySelector('[data-last]');
      if (last) observer.observe(last);
      return () => observer.disconnect();
    }
  }, [messages, currentUserId, onVisible]);

  // Build flat item list with date separators injected between different days
  type DateSep = { kind: 'date'; key: string; label: string };
  type MsgRow  = { kind: 'msg'; key: string; msg: Message; idx: number; isFirst: boolean; isLast: boolean };
  const items: Array<DateSep | MsgRow> = [];

  let lastDate: Date | null = null;

  messages.forEach((m, i) => {
    const d = m.createdAt ? new Date(m.createdAt) : null;

    // Date separator when the calendar day changes
    if (d && (!lastDate || !isSameDay(d, lastDate))) {
      items.push({ kind: 'date', key: `sep-${d.toDateString()}`, label: getDateLabel(d) });
      lastDate = d;
    }

    // Grouping — same sender + within threshold = same group
    const prev = messages[i - 1];
    const next = messages[i + 1];

    const gapBefore = prev?.createdAt && m.createdAt
      ? new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()
      : Infinity;
    const gapAfter = next?.createdAt && m.createdAt
      ? new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime()
      : Infinity;

    const isFirst = !prev || prev.senderId !== m.senderId || gapBefore > GROUP_TIME_MS;
    const isLast  = !next || next.senderId !== m.senderId || gapAfter  > GROUP_TIME_MS;

    items.push({ kind: 'msg', key: m.id || `msg-${i}`, msg: m, idx: i, isFirst, isLast });
  });

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-[#ECE5DD] dark:bg-[#0B141A]"
      style={
        wallpaper
          ? (wallpaper.startsWith('#') || wallpaper.startsWith('rgb')
            ? { backgroundColor: wallpaper, backgroundImage: 'none' }
            : { backgroundImage: `url("${wallpaper}")`, backgroundSize: 'cover', backgroundPosition: 'center' })
          : {}
      }
    >
      {/* WhatsApp Web uses ~5% horizontal padding on each side */}
      <div className="px-[5%] lg:px-[63px] pt-2 pb-1">
        {items.map((item) => {
          if (item.kind === 'date') {
            return (
              <div key={item.key} className="flex justify-center my-3">
                <span className="bg-[#E1F2FB] dark:bg-[#233138] text-[#54656F] dark:text-[#8696A0] text-[11.5px] font-medium px-3 py-[5px] rounded-lg shadow-sm dark:shadow-none">
                  {item.label}
                </span>
              </div>
            );
          }

          const { msg: m, idx: i, isFirst, isLast } = item;
          const isOwn = m.senderId === currentUserId;
          const isHighlighted = m.id === highlightedMessageId;

          // WhatsApp spacing: ~2px within a group, ~8px between groups
          const marginBottom = isLast ? 'mb-[8px]' : 'mb-[2px]';

          return (
            <div
              key={item.key}
              data-last={i === messages.length - 1 ? true : undefined}
              data-msg-id={m.id}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${marginBottom} ${
                isHighlighted ? 'transition-colors duration-500' : ''
              }`}
            >
              <MessageBubble
                message={m}
                isOwn={isOwn}
                showSender={!!isGroup && !isOwn && isFirst}
                isFirstInGroup={isFirst}
                isLastInGroup={isLast}
                senderId={m.senderId}
                onForward={onForward}
                onDelete={onDelete}
                onReply={onReply}
                onReact={onReact}
                onStar={onStar}
                onPin={onPin}
                onEdit={onEdit}
                onProfileClick={onProfileClick}
                searchQuery={searchQuery}
                isHighlighted={isHighlighted}
                currentUserId={currentUserId}
              />
            </div>
          );
        })}
        <div ref={bottomRef} className="h-1" />
      </div>
    </div>
  );
}
