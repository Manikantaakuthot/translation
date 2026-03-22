import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Trash2, Eye, Send } from 'lucide-react';

interface StatusItem {
  id: string;
  type: string;
  content?: string;
  mediaUrl?: string;
  backgroundColor?: string;
  createdAt: string;
  viewedByMe?: boolean;
  viewerCount?: number;
  viewers?: { userId: string; userName?: string; profilePictureUrl?: string; viewedAt: string }[];
}

interface StatusUser {
  userId: string;
  userName: string;
  profilePictureUrl?: string;
  statuses: StatusItem[];
}

interface Props {
  user: StatusUser;
  initialIndex: number;
  currentUserId: string;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onDelete?: (statusId: string) => void;
  onReply?: (userId: string, message: string, statusId: string) => void;
}

// Duration per status type (ms)
const DURATION: Record<string, number> = {
  text: 5000,
  image: 7000,
  video: 0, // video auto-advances when it ends
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return 'Yesterday';
}

export default function StatusViewer({
  user,
  initialIndex,
  currentUserId,
  onClose,
  onNext,
  onPrev,
  onDelete,
  onReply,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [reply, setReply] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const status = user.statuses[currentIndex];
  const isOwn = user.userId === currentUserId;
  const duration = status?.type === 'video' ? 0 : (DURATION[status?.type] || 5000);

  const goNext = useCallback(() => {
    if (currentIndex < user.statuses.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
      setShowViewers(false);
    } else {
      onNext();
    }
  }, [currentIndex, user.statuses.length, onNext]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setProgress(0);
      setShowViewers(false);
    } else {
      onPrev();
    }
  }, [currentIndex, onPrev]);

  // Animate progress bar
  useEffect(() => {
    if (!status || duration === 0 || paused) return;

    const animate = (now: number) => {
      if (startTimeRef.current === 0) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const p = Math.min((elapsed / duration) * 100, 100);
      progressRef.current = p;
      setProgress(p);

      if (p < 100) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        goNext();
      }
    };

    startTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      startTimeRef.current = 0;
    };
  }, [currentIndex, paused, duration, goNext]);

  // Video ended → advance
  const handleVideoEnded = () => {
    goNext();
  };

  if (!status) return null;

  const bgStyle =
    status.type === 'text' && status.backgroundColor
      ? { backgroundColor: status.backgroundColor }
      : {};

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col select-none"
      style={status.type === 'text' && status.backgroundColor ? bgStyle : { backgroundColor: '#000' }}
    >
      {/* ── Progress bars ── */}
      <div className="absolute top-0 left-0 right-0 flex gap-1 px-2 pt-2 z-20">
        {user.statuses.map((s, i) => (
          <div
            key={s.id}
            className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{
                width:
                  i < currentIndex
                    ? '100%'
                    : i === currentIndex
                    ? `${progress}%`
                    : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="absolute top-5 left-0 right-0 flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#128C7E]/30 overflow-hidden flex items-center justify-center text-white font-bold flex-shrink-0">
            {user.profilePictureUrl ? (
              <img src={user.profilePictureUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              user.userName[0]?.toUpperCase() || '?'
            )}
          </div>
          <div>
            <p className="font-semibold text-white text-sm leading-none">{user.userName}</p>
            <p className="text-white/70 text-xs mt-0.5">{relativeTime(status.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isOwn && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this status?')) {
                  onDelete(status.id);
                  if (user.statuses.length === 1) {
                    onClose();
                  } else if (currentIndex >= user.statuses.length - 1) {
                    setCurrentIndex(currentIndex - 1);
                  }
                }
              }}
              className="p-2 rounded-full hover:bg-white/20 text-white/90"
              title="Delete status"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-2 rounded-full hover:bg-white/20 text-white"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/* ── Content area (click left/right to navigate) ── */}
      <div
        className="flex-1 flex items-center justify-center relative"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < rect.width * 0.3) goPrev();
          else if (x > rect.width * 0.7) goNext();
        }}
      >
        {status.type === 'text' && (
          <p className="text-white text-2xl font-medium text-center max-w-sm px-8 leading-relaxed drop-shadow-md">
            {status.content}
          </p>
        )}
        {status.type === 'image' && status.mediaUrl && (
          <img
            src={status.mediaUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        )}
        {status.type === 'video' && status.mediaUrl && (
          <video
            ref={videoRef}
            src={status.mediaUrl}
            autoPlay
            playsInline
            className="max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
            onEnded={handleVideoEnded}
          />
        )}
      </div>

      {/* ── Viewed-by footer (own statuses only) ── */}
      {isOwn && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-6">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowViewers((v) => !v);
            }}
            className="flex items-center gap-2 mx-auto px-5 py-2 bg-black/40 rounded-full text-white text-sm backdrop-blur-sm"
          >
            <Eye size={16} />
            <span>
              {status.viewerCount || 0} view{status.viewerCount !== 1 ? 's' : ''}
            </span>
          </button>

          {showViewers && status.viewers && status.viewers.length > 0 && (
            <div
              className="mx-4 mt-2 bg-black/60 backdrop-blur-md rounded-2xl overflow-hidden max-h-48 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {status.viewers.map((v) => (
                <div key={v.userId} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#128C7E]/30 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden">
                    {v.profilePictureUrl ? (
                      <img src={v.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (v.userName || v.userId)?.[0]?.toUpperCase() || '?'
                    )}
                  </div>
                  <span className="text-white text-sm flex-1 truncate">{v.userName || v.userId}</span>
                  <span className="text-white/50 text-xs">{relativeTime(v.viewedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reply input (for other users' statuses) ── */}
      {!isOwn && onReply && (
        <div className="absolute bottom-4 left-4 right-4 z-20">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (reply.trim()) {
                onReply(user.userId, reply.trim(), status.id);
                setReply('');
                setShowReplyInput(false);
              }
            }}
            className="flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-4 py-2.5 border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={replyInputRef}
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => { setPaused(true); setShowReplyInput(true); }}
              onBlur={() => { if (!reply) { setPaused(false); setShowReplyInput(false); } }}
              placeholder="Reply to status..."
              className="flex-1 bg-transparent text-white placeholder-white/40 outline-none text-sm"
            />
            {reply.trim() && (
              <button type="submit" className="text-[#25D366] hover:text-[#20BD5B] transition-colors p-1">
                <Send size={18} />
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
