import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { Languages, Volume2, Copy, Reply, Star, Pin, Download, Play, Pause, FileText, File as FileIcon, ChevronDown, Pencil, Eye, Clock, User, MessageSquare, ExternalLink } from 'lucide-react';
import type { Message } from '../../store/chatStore';
import { useTranslationStore } from '../../store/translationStore';
import { translationService } from '../../services/TranslationService';
import { useAuthStore } from '../../store/authStore';
import { messagesApi, conversationsApi } from '../../api/client';
import { useChatStore } from '../../store/chatStore';
import PollBubble from './PollBubble';
import LocationBubble from './LocationBubble';

interface Props {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onForward?: (message: Message) => void;
  onDelete?: (message: Message, deleteForEveryone: boolean) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (message: Message) => void;
  onStar?: (message: Message) => void;
  onPin?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onProfileClick?: (userId: string) => void;
  senderId?: string;
  searchQuery?: string;
  isHighlighted?: boolean;
  currentUserId?: string;
}

// WhatsApp-style text formatting: *bold*, _italic_, ~strikethrough~, `monospace`, ```code block```
function FormattedText({ text, query }: { text: string; query?: string }) {
  // Parse WhatsApp formatting tokens into React elements
  const formatText = (input: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let remaining = input;
    let key = 0;

    // Order matters: ```code block``` before `monospace`, *bold* before _italic_
    const patterns: { regex: RegExp; render: (match: string) => React.ReactNode }[] = [
      { regex: /```([\s\S]+?)```/, render: (m) => <code key={key++} className="block bg-gray-200/70 text-[#333] text-[13px] font-mono rounded px-2 py-1 my-1 whitespace-pre-wrap">{m}</code> },
      { regex: /`([^`]+)`/, render: (m) => <code key={key++} className="bg-gray-200/70 text-[#333] text-[13px] font-mono rounded px-1">{m}</code> },
      { regex: /\*([^\s*](?:[^*]*[^\s*])?)\*/, render: (m) => <strong key={key++}>{formatText(m)}</strong> },
      { regex: /_([^\s_](?:[^_]*[^\s_])?)_/, render: (m) => <em key={key++}>{formatText(m)}</em> },
      { regex: /~([^\s~](?:[^~]*[^\s~])?)~/, render: (m) => <del key={key++} className="text-gray-500">{formatText(m)}</del> },
      { regex: /@(\w[\w\s]{0,30}?)(?=\s|$)/, render: (m) => <span key={key++} className="text-[#007BFC] font-medium cursor-pointer hover:underline">@{m}</span> },
    ];

    while (remaining.length > 0) {
      let earliest: { index: number; length: number; inner: string; render: (m: string) => React.ReactNode } | null = null;

      for (const p of patterns) {
        const match = remaining.match(p.regex);
        if (match && match.index !== undefined) {
          if (!earliest || match.index < earliest.index) {
            earliest = { index: match.index, length: match[0].length, inner: match[1], render: p.render };
          }
        }
      }

      if (earliest) {
        if (earliest.index > 0) {
          nodes.push(<span key={key++}>{remaining.slice(0, earliest.index)}</span>);
        }
        nodes.push(earliest.render(earliest.inner));
        remaining = remaining.slice(earliest.index + earliest.length);
      } else {
        nodes.push(<span key={key++}>{remaining}</span>);
        break;
      }
    }

    return nodes;
  };

  const formatted = formatText(text);

  // If there's a search query, apply highlighting on the rendered text
  if (!query || !query.trim()) return <>{formatted}</>;

  // For search highlighting, we wrap the entire formatted output and highlight at the text level
  return <HighlightedFormattedText nodes={formatted} query={query} />;
}

// Apply search highlighting to already-formatted React nodes
function HighlightedFormattedText({ nodes, query }: { nodes: React.ReactNode[]; query: string }) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  let key = 0;

  const highlightNode = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === 'string') {
      const parts = node.split(regex);
      if (parts.length === 1) return node;
      return (
        <>
          {parts.map((part) =>
            part.toLowerCase() === query.toLowerCase() ? (
              <mark key={key++} className="bg-[#FCF4CB] text-inherit rounded-sm px-[1px]">{part}</mark>
            ) : (
              <span key={key++}>{part}</span>
            )
          )}
        </>
      );
    }
    if (node && typeof node === 'object' && 'props' in (node as any)) {
      const el = node as React.ReactElement;
      if (el.props.children) {
        const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
        const highlighted = children.map((c: React.ReactNode) => highlightNode(c));
        return { ...el, props: { ...el.props, children: highlighted }, key: `hl-${key++}` };
      }
    }
    return node;
  };

  return <>{nodes.map((n) => highlightNode(n))}</>;
}

export default function MessageBubble({ message, isOwn, showSender, isFirstInGroup, isLastInGroup, onForward, onDelete, onReact, onReply, onStar, onPin, onEdit, onProfileClick, senderId, searchQuery, isHighlighted, currentUserId }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { preferredLanguage, translateMessage } = useTranslationStore();

  const [viewOnceOpened, setViewOnceOpened] = useState(false);
  const [showViewOnceModal, setShowViewOnceModal] = useState(false);

  const isImage = message.type === 'image' && message.mediaUrl;
  const isVideo = message.type === 'video' && message.mediaUrl;
  const isDocument = message.type === 'document' && message.mediaUrl;
  const isVoice = (message.type === 'voice' || message.type === 'audio') && message.mediaUrl;
  const isTextMessage = message.type === 'text' && message.content && !message.isDeleted;
  const isContact = message.type === 'contact';
  const isPoll = message.type === 'poll' && message.poll;
  const isLocation = message.type === 'location' && message.location;
  const isViewOnce = message.isViewOnce;
  const hasBeenViewed = isViewOnce && currentUserId && message.viewedBy?.includes(currentUserId);
  const canEdit = isOwn && isTextMessage && message.createdAt &&
    (Date.now() - new Date(message.createdAt).getTime() < 15 * 60 * 1000);

  const reactions = message.reactions || {};
  const reactionSummary = Object.entries(reactions).reduce((acc, [_userId, emoji]) => {
    acc[emoji] = (acc[emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const quickReactions = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'];

  const handleTranslate = async () => {
    if (translatedText) {
      setShowTranslation(!showTranslation);
      return;
    }
    setTranslating(true);
    try {
      const result = await translateMessage(message.id!, preferredLanguage);
      setTranslatedText(result);
      setShowTranslation(true);
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setTranslating(false);
    }
  };

  const handleSpeak = () => {
    if (speaking) {
      translationService.stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!translatedText) return;
    setSpeaking(true);
    translationService.speak(translatedText, preferredLanguage, () => {
      setSpeaking(false);
    });
  };

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
    setShowMenu(false);
  };

  // WhatsApp tail: only the LAST message of a consecutive group gets the pointed corner
  const hasTail = isLastInGroup !== false; // default true for standalone messages
  const bubbleRadius = hasTail
    ? isOwn
      ? 'rounded-lg rounded-br-[3px]'   // sent: tail bottom-right
      : 'rounded-lg rounded-bl-[3px]'   // received: tail bottom-left
    : 'rounded-lg';                       // mid-group: fully rounded

  return (
    <div
      className={`max-w-[65%] ${bubbleRadius} px-[9px] py-[6px] pb-[8px] shadow-sm relative select-none ${
        isOwn ? 'bg-[#D9FDD3] dark:bg-[#005C4B]' : 'bg-white dark:bg-[#202C33]'
      } ${isHighlighted ? 'ring-2 ring-[#128C7E] ring-offset-1' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* WhatsApp-style dropdown chevron — inside bubble, top-right, gradient bg */}
      {(isHovered || showMenu) && !message.isDeleted && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
          className="absolute top-0 right-0 z-10 flex items-center justify-center w-[26px] h-[26px] rounded-br-lg rounded-tl-sm text-gray-500 dark:text-[#8696A0] hover:text-gray-700 dark:hover:text-[#E9EDEF] transition-opacity"
          style={{
            background: isOwn
              ? 'linear-gradient(135deg, transparent 30%, #D9FDD3 70%)'
              : 'linear-gradient(135deg, transparent 30%, #ffffff 70%)',
          }}
        >
          <ChevronDown size={14} />
        </button>
      )}
      {/* Star/Pin indicators */}
      {(message.isStarred || message.isPinned) && (
        <div className="flex gap-1 mb-1">
          {message.isStarred && <Star size={10} className="text-yellow-500 fill-yellow-500" />}
          {message.isPinned && <Pin size={10} className="text-[#128C7E]" />}
        </div>
      )}

      {showSender && !isOwn && message.senderName && (
        <p
          className="text-xs font-medium text-[#128C7E] mb-0.5 cursor-pointer hover:underline"
          onClick={() => senderId && onProfileClick && onProfileClick(senderId)}
        >
          {message.senderName}
        </p>
      )}

      {/* Reply quote */}
      {message.replyToMessage && (
        <div className="mb-1.5 px-2 py-1 border-l-4 border-[#128C7E] bg-black/5 rounded text-xs">
          <p className="font-medium text-[#128C7E] truncate">
            {message.replyToMessage.senderName || 'Message'}
          </p>
          <p className={`text-gray-600 truncate ${message.replyToMessage.isDeleted ? 'italic text-gray-400' : ''}`}>
            {message.replyToMessage.isDeleted
              ? '🚫 This message was deleted'
              : message.replyToMessage.type !== 'text'
                ? `[${message.replyToMessage.type}]`
                : message.replyToMessage.content}
          </p>
        </div>
      )}

      {/* ── Deleted message — show placeholder, nothing else ── */}
      {message.isDeleted ? (
        <p className="text-sm italic text-gray-400 flex items-center gap-1.5 select-none">
          <span>🚫</span>
          <span>{isOwn ? 'You deleted this message' : 'This message was deleted'}</span>
        </p>
      ) : (
        <>

      {/* ── Image ── */}
      {isImage && (
        <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={message.mediaUrl}
            alt=""
            className="max-w-full max-h-64 rounded-lg object-contain"
            loading="lazy"
          />
        </a>
      )}

      {/* ── Video — WhatsApp style thumbnail + play overlay ── */}
      {isVideo && (
        <>
          <div
            className="relative rounded-lg overflow-hidden cursor-pointer group"
            style={{ maxWidth: '100%', minWidth: 200 }}
            onClick={() => setShowVideoModal(true)}
          >
            <video
              ref={videoRef}
              src={message.mediaUrl}
              preload="metadata"
              className="w-full max-h-56 object-cover rounded-lg bg-black"
              playsInline
            />
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors rounded-lg">
              <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play size={20} className="text-gray-800 ml-1" fill="currentColor" />
              </div>
            </div>
          </div>

          {/* Full-screen video player modal */}
          {showVideoModal && (
            <div
              className="fixed inset-0 z-50 bg-black flex items-center justify-center"
              onClick={() => setShowVideoModal(false)}
            >
              <video
                src={message.mediaUrl}
                controls
                autoPlay
                className="max-w-full max-h-full"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2"
                onClick={() => setShowVideoModal(false)}
              >
                ✕
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Voice / Audio — WhatsApp style waveform card ── */}
      {isVoice && (
        <div className={`flex items-center gap-3 px-1 py-1 rounded-xl min-w-[200px] ${isOwn ? '' : ''}`}>
          <button
            onClick={() => {
              const audio = document.getElementById(`audio-${message.id}`) as HTMLAudioElement;
              if (!audio) return;
              if (videoPlaying) { audio.pause(); setVideoPlaying(false); }
              else { audio.play(); setVideoPlaying(true); }
            }}
            className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center flex-shrink-0 text-white"
          >
            {videoPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
          </button>
          {/* Waveform bars (decorative) */}
          <div className="flex items-center gap-[2px] flex-1 h-8">
            {Array.from({ length: 28 }).map((_, i) => (
              <div
                key={i}
                className="rounded-full bg-[#128C7E]/60 flex-1"
                style={{ height: `${20 + Math.sin(i * 1.3) * 10 + Math.cos(i * 0.7) * 6}%` }}
              />
            ))}
          </div>
          <audio
            id={`audio-${message.id}`}
            src={message.mediaUrl}
            onEnded={() => setVideoPlaying(false)}
            onPause={() => setVideoPlaying(false)}
            onPlay={() => setVideoPlaying(true)}
            className="hidden"
          />
        </div>
      )}

      {/* ── Document / PDF — WhatsApp style file card ── */}
      {isDocument && (() => {
        const rawName = decodeURIComponent(
          (message.mediaUrl?.split('/').pop() || 'document').split('?')[0]
        );
        // Prefer content as filename (set by MessageInput when sending), fall back to URL slug
        // Strip timestamp or UUID prefix from URL slug
        const urlSlug = rawName
          .replace(/^\d{10,}-/, '')          // timestamp prefix
          .replace(/^[0-9a-f-]{36}-/i, '');  // UUID prefix
        const fileName = (message.content && message.content !== 'This message was deleted')
          ? message.content
          : urlSlug || 'Document';
        const ext = fileName.split('.').pop()?.toUpperCase() || 'DOC';
        const isPdf = ext === 'PDF';
        const isWord = ['DOC', 'DOCX'].includes(ext);
        const isSheet = ['XLS', 'XLSX', 'CSV'].includes(ext);
        const iconBg = isPdf ? 'bg-red-100' : isWord ? 'bg-blue-100' : isSheet ? 'bg-green-100' : 'bg-gray-100';
        const iconColor = isPdf ? 'text-red-600' : isWord ? 'text-blue-600' : isSheet ? 'text-green-700' : 'text-gray-600';
        return (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={fileName}
            className="flex items-center gap-3 p-2 rounded-xl bg-black/5 hover:bg-black/10 transition min-w-[220px] group"
          >
            <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${iconBg}`}>
              {isPdf || isWord ? (
                <FileText size={20} className={iconColor} />
              ) : (
                <FileIcon size={20} className={iconColor} />
              )}
              <span className={`text-[8px] font-bold mt-0.5 ${iconColor}`}>{ext}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate leading-tight">{fileName}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {isPdf ? 'PDF Document' : isWord ? 'Word Document' : isSheet ? 'Spreadsheet' : 'File'}
              </p>
            </div>
            <Download size={16} className="text-gray-400 group-hover:text-[#128C7E] flex-shrink-0 transition-colors" />
          </a>
        );
      })()}
      {/* ── View Once Media — blurred placeholder or opened indicator ── */}
      {isViewOnce && (isImage || isVideo) && !isOwn && !hasBeenViewed && !viewOnceOpened && (
        <div
          className="relative rounded-lg overflow-hidden cursor-pointer bg-gray-200 flex items-center justify-center min-h-[120px] min-w-[200px]"
          onClick={() => { setShowViewOnceModal(true); setViewOnceOpened(true); messagesApi.markViewOnce(message.id!).catch(() => {}); }}
        >
          <div className="text-center">
            <Eye size={32} className="mx-auto text-gray-500 mb-1" />
            <p className="text-xs text-gray-500 font-medium">{isImage ? 'Photo' : 'Video'}</p>
            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#25D366] text-white text-[10px] flex items-center justify-center font-bold">1</span>
          </div>
        </div>
      )}
      {isViewOnce && (hasBeenViewed || viewOnceOpened) && !isOwn && (
        <div className="flex items-center gap-1.5 py-2 text-gray-400 text-xs italic">
          <Eye size={14} /> Opened
        </div>
      )}
      {isViewOnce && isOwn && (
        <>
          {(isImage && !hasBeenViewed) && <img src={message.mediaUrl} alt="" className="max-w-full max-h-64 rounded-lg object-contain filter blur-lg" loading="lazy" />}
          <div className="flex items-center gap-1.5 text-gray-400 text-xs italic mt-1">
            <Clock size={12} /> View once {message.viewedBy?.length ? '· Opened' : ''}
          </div>
        </>
      )}

      {/* View Once Modal */}
      {showViewOnceModal && message.mediaUrl && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setShowViewOnceModal(false)}>
          {isImage && <img src={message.mediaUrl} alt="" className="max-w-full max-h-full object-contain" />}
          {isVideo && <video src={message.mediaUrl} controls autoPlay className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()} />}
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2" onClick={() => setShowViewOnceModal(false)}>✕</button>
          <p className="absolute bottom-6 text-white/70 text-sm">This media can only be viewed once</p>
        </div>
      )}

      {/* ── Contact Card ── */}
      {isContact && message.content && (() => {
        try {
          const contact = typeof message.content === 'string' ? JSON.parse(message.content) : message.sharedContact;
          if (!contact) return null;
          return (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-black/5 min-w-[220px]">
              <div className="w-11 h-11 rounded-full bg-[#128C7E]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {contact.avatar ? (
                  <img src={contact.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="text-[#128C7E]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{contact.name}</p>
                <p className="text-[11px] text-gray-500">Contact</p>
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const { data } = await conversationsApi.getOrCreateDirect(contact.phone);
                    window.location.href = `/chat/${data.id}`;
                  } catch (err) {
                    console.error('Failed to open chat:', err);
                  }
                }}
                className="p-1.5 rounded-full hover:bg-black/10 text-[#128C7E]"
                title="Message"
              >
                <MessageSquare size={16} />
              </button>
            </div>
          );
        } catch { return null; }
      })()}

      {/* ── Poll ── */}
      {message.type === 'poll' && message.poll && (
        <PollBubble
          poll={message.poll}
          messageId={message.id!}
          currentUserId={currentUserId}
          isOwn={isOwn}
          onVote={(messageId, optionIndex) => {
            messagesApi.votePoll(messageId, optionIndex)
              .then(({ data }) => {
                if (data?.poll) {
                  useChatStore.getState().updateMessage(message.conversationId, messageId, { poll: data.poll });
                }
              })
              .catch(console.error);
          }}
        />
      )}

      {/* ── Location ── */}
      {message.type === 'location' && message.location && (
        <LocationBubble location={message.location} isOwn={isOwn} />
      )}

      {/* Caption text — not shown for documents, contacts, polls, or locations (content is in the card) */}
      {message.content && !isDocument && !isContact && message.type !== 'poll' && message.type !== 'location' && !(isViewOnce && !isOwn) && (
        <p className="text-gray-800 text-sm break-words mt-1">
          <FormattedText text={message.content} query={searchQuery || ''} />
        </p>
      )}

      {/* ── Link Preview Card ── */}
      {message.linkPreview && message.linkPreview.title && (
        <a
          href={message.linkPreview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-1.5 rounded-lg overflow-hidden border border-gray-200/50 bg-black/5 hover:bg-black/10 transition"
        >
          {message.linkPreview.image && (
            <img src={message.linkPreview.image} alt="" className="w-full h-32 object-cover" loading="lazy" />
          )}
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-gray-800 line-clamp-2">{message.linkPreview.title}</p>
            {message.linkPreview.description && (
              <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{message.linkPreview.description}</p>
            )}
            <p className="text-[10px] text-[#128C7E] mt-1 flex items-center gap-1 truncate">
              <ExternalLink size={10} />
              {message.linkPreview.url.replace(/^https?:\/\//, '').split('/')[0]}
            </p>
          </div>
        </a>
      )}

        </> /* end non-deleted block */
      )}

      {/* Translation Display */}
      {showTranslation && translatedText && (
        <div className="mt-2 pt-2 border-t border-gray-300/50">
          <div className="flex items-center gap-1 mb-1">
            <Languages size={12} className="text-[#128C7E]" />
            <span className="text-[10px] text-[#128C7E] font-medium">Translation</span>
            <button
              onClick={handleSpeak}
              className={`ml-auto p-0.5 rounded ${speaking ? 'text-[#128C7E]' : 'text-gray-400 hover:text-[#128C7E]'}`}
            >
              <Volume2 size={14} />
            </button>
          </div>
          <p className="text-gray-700 text-sm italic">{translatedText}</p>
        </div>
      )}

      {/* Reactions Display */}
      {Object.keys(reactionSummary).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 mb-1">
          {Object.entries(reactionSummary).map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => onReact && onReact(message.id!, emoji)}
              className="px-2 py-0.5 bg-white/80 border border-gray-200 rounded-full text-xs flex items-center gap-1 hover:bg-gray-100"
            >
              <span>{emoji}</span>
              <span className="text-gray-600">{count}</span>
            </button>
          ))}
        </div>
      )}

      {message.failedToSend && (
        <div className="flex items-center gap-1 mt-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/>
            <path d="M12 8v4M12 16h.01" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="text-[10px] text-red-500">Not sent. Tap to retry</span>
        </div>
      )}

      <div className="flex justify-end items-center gap-1 mt-[2px] -mb-[2px]">
        {copied && <span className="text-[10px] text-[#128C7E]">Copied!</span>}
        {(message as any).isEdited && <span className="text-[10px] text-gray-400 italic">edited</span>}
        <span className="text-[10px] text-gray-500">
          {message.createdAt ? format(new Date(message.createdAt), 'HH:mm') : ''}
        </span>
        {isOwn && (() => {
          const isRead = !!message.status?.read?.length;
          const isDelivered = !!message.status?.delivered?.length;
          const isSent = !!message.status?.sent;
          if (isRead) {
            // Blue double ticks — message was read
            return (
              <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-label="Read">
                <path d="M1 6L4.5 9.5L10.5 2" stroke="#53BDEB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 6L9.5 9.5L15.5 2" stroke="#53BDEB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            );
          }
          if (isDelivered) {
            // Grey double ticks — delivered to device
            return (
              <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-label="Delivered">
                <path d="M1 6L4.5 9.5L10.5 2" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 6L9.5 9.5L15.5 2" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            );
          }
          if (isSent) {
            // Grey single tick — sent to server
            return (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-label="Sent">
                <path d="M1 6L4.5 9.5L10.5 2" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            );
          }
          // Clock icon — pending/not yet sent
          return (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-label="Pending">
              <circle cx="6" cy="6" r="4.5" stroke="#9CA3AF" strokeWidth="1.5"/>
              <path d="M6 3.5V6L7.5 7.5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          );
        })()}
      </div>

      {/* Context Menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className={`absolute top-[26px] py-1 bg-white rounded-lg shadow-xl border border-gray-200 z-20 min-w-[160px] ${isOwn ? 'right-0' : 'left-0'}`}>
            {isTextMessage && (
              <button
                onClick={handleCopy}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Copy size={15} />
                Copy
              </button>
            )}
            {canEdit && onEdit && (
              <button
                onClick={() => { onEdit(message); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Pencil size={15} />
                Edit
              </button>
            )}
            {onReply && (
              <button
                onClick={() => { onReply(message); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Reply size={15} />
                Reply
              </button>
            )}
            {onStar && (
              <button
                onClick={() => { onStar(message); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Star size={15} className={message.isStarred ? 'text-yellow-500 fill-yellow-500' : ''} />
                {message.isStarred ? 'Unstar' : 'Star'}
              </button>
            )}
            {onPin && (
              <button
                onClick={() => { onPin(message); setShowMenu(false); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Pin size={15} className={message.isPinned ? 'text-[#128C7E]' : ''} />
                {message.isPinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {isTextMessage && (
              <button
                onClick={() => {
                  handleTranslate();
                  setShowMenu(false);
                }}
                disabled={translating}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Languages size={15} />
                {translating ? 'Translating...' : translatedText ? 'Show translation' : 'Translate'}
              </button>
            )}
            {onReact && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowReactionPicker(true);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
              >
                React
              </button>
            )}
            {onForward && (
              <button
                onClick={() => {
                  onForward(message);
                  setShowMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
              >
                Forward
              </button>
            )}
            {onDelete && !message.isDeleted && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowDeleteModal(true);
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Delete
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Delete Confirmation Modal — WhatsApp style ── */}
      {showDeleteModal && onDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center sm:items-center p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-white dark:bg-[#233138] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-base font-semibold text-gray-800 dark:text-[#E9EDEF] text-center">Delete message?</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1">Choose who to delete this for</p>
            </div>
            <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
              <button
                onClick={() => { onDelete(message, false); setShowDeleteModal(false); }}
                className="px-5 py-4 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2A3942] flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-[#2A3942] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-400">
                    <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-800 dark:text-[#E9EDEF]">Delete for me</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">This message will be removed only from your view</p>
                </div>
              </button>
              {isOwn && message.createdAt && (Date.now() - new Date(message.createdAt).getTime() < 48 * 60 * 60 * 1000) && (
                <button
                  onClick={() => { onDelete(message, true); setShowDeleteModal(false); }}
                  className="px-5 py-4 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                      <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-red-600 dark:text-red-400">Delete for everyone</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">This message will be removed for all participants</p>
                  </div>
                </button>
              )}
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-5 py-3.5 text-center text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#2A3942]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reaction Picker */}
      {showReactionPicker && onReact && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowReactionPicker(false)}
          />
          <div className="absolute right-0 bottom-full mb-2 p-2 bg-white rounded-lg shadow-xl border border-gray-200 z-20 flex gap-1">
            {quickReactions.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(message.id!, emoji);
                  setShowReactionPicker(false);
                }}
                className="w-10 h-10 text-2xl hover:bg-gray-100 rounded-lg transition"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
