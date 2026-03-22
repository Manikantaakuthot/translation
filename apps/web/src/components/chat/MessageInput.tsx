import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Smile, Mic, X, FileText, File as FileIcon, Plus, Image, Headphones, Camera, BarChart2, User, Pencil, Check, MapPin, Sticker } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useSocket } from '../../hooks/useSocket';
import { useAuthStore } from '../../store/authStore';
import { mediaApi } from '../../api/client';
import type { Message } from '../../store/chatStore';
import PollCreator from './PollCreator';
import GifPicker from './GifPicker';
import LocationPicker from './LocationPicker';
import StickerPicker from './StickerPicker';
import FormattingToolbar from './FormattingToolbar';
import 'emoji-picker-element';

interface Props {
  conversationId: string;
  onSend?: () => void;
  replyMessage?: Message | null;
  onClearReply?: () => void;
  editingMessage?: Message | null;
  onClearEdit?: () => void;
  participants?: { userId: string; name?: string }[];
  isGroup?: boolean;
}

// Wrapper for emoji-picker-element web component
function EmojiPickerWrapper({ onSelect }: { onSelect: (emoji: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Create the web component
    const picker = document.createElement('emoji-picker') as any;
    picker.setAttribute('class', 'light');
    picker.style.width = '320px';
    picker.style.height = '360px';
    picker.style.setProperty('--border-size', '0');
    picker.style.setProperty('--border-radius', '0');
    picker.addEventListener('emoji-click', (e: any) => {
      const unicode = e.detail?.unicode;
      if (unicode) onSelect(unicode);
    });
    container.appendChild(picker);
    return () => {
      container.removeChild(picker);
    };
  }, [onSelect]);

  return <div ref={containerRef} />;
}

export default function MessageInput({ conversationId, onSend, replyMessage, onClearReply, editingMessage, onClearEdit, participants, isGroup }: Props) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaPreview, setMediaPreview] = useState<{ file: File; url: string; type: string; fileName?: string; fileSize?: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIdx, setMentionStartIdx] = useState(-1);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval>>();
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const { sendMessage, editMessage: editMessageAction } = useChatStore();
  const { accessToken } = useAuthStore();
  const { socket } = useSocket(accessToken);

  // When entering edit mode, prefill the input with the message content
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || '');
      textInputRef.current?.focus();
    }
  }, [editingMessage]);

  // Close emoji picker / attach menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();

    // Edit mode: update the existing message
    if (editingMessage) {
      setText('');
      try {
        await editMessageAction(editingMessage.id, conversationId, content);
        onClearEdit?.();
      } catch (err) {
        setText(content);
        console.error('[MessageInput] Failed to edit message:', err);
      }
      return;
    }

    setText('');
    const result = await sendMessage(conversationId, content, {
      replyToMessageId: replyMessage?.id,
    });
    if (result) {
      onSend?.();
      onClearReply?.();
    } else {
      setText(content);
      console.error('[MessageInput] Failed to send message');
    }
  };

  const insertEmoji = (emoji: string) => {
    const input = textInputRef.current;
    if (!input) {
      setText((t) => t + emoji);
      return;
    }
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);
    // Restore cursor after emoji
    setTimeout(() => {
      input.setSelectionRange(start + emoji.length, start + emoji.length);
      input.focus();
    }, 0);
  };

  const getMediaType = (file: File): string => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = getMediaType(file);
    if (type === 'image' || type === 'video') {
      // Show preview modal with media preview
      const url = URL.createObjectURL(file);
      setMediaPreview({ file, url, type });
      setCaption('');
    } else if (type === 'document' || type === 'audio') {
      // Show preview modal for documents/audio (no object URL needed for display)
      setMediaPreview({
        file,
        url: '',
        type,
        fileName: file.name,
        fileSize: formatFileSize(file.size),
      });
      setCaption('');
    }
    e.target.value = '';
  };

  const handleSendMedia = async () => {
    if (!mediaPreview) return;
    setUploading(true);
    try {
      const { data } = await mediaApi.upload(mediaPreview.file);
      // For documents: use caption OR the original filename as the message content
      // so the bubble can display the real name instead of the server-generated UUID
      const isDoc = mediaPreview.type === 'document';
      const content = isDoc
        ? (caption.trim() || mediaPreview.fileName || mediaPreview.file.name)
        : caption;
      await sendMessage(conversationId, content, {
        type: mediaPreview.type,
        mediaUrl: data.mediaUrl,
        replyToMessageId: replyMessage?.id,
      });
      onSend?.();
      onClearReply?.();
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      if (mediaPreview.url) URL.revokeObjectURL(mediaPreview.url);
      setMediaPreview(null);
      setCaption('');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recordingTimerRef.current);
        setRecordingTime(0);
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        setUploading(true);
        try {
          const { data } = await mediaApi.upload(file);
          await sendMessage(conversationId, '', { type: 'voice', mediaUrl: data.mediaUrl });
          onSend?.();
        } catch (err) {
          console.error('Voice upload failed', err);
        } finally {
          setUploading(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied', err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!socket) return;
    if (text.length > 0) {
      // Only emit if not already throttled (once per 2s window)
      if (!typingTimeoutRef.current) {
        socket.emit('message:typing', { conversationId });
      }
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = undefined;
      }, 2000);
    }
    return () => clearTimeout(typingTimeoutRef.current);
  }, [socket, conversationId, text]);

  // @ Mention filtering
  const filteredMentions = (participants || []).filter((p) =>
    !mentionQuery || (p.name || '').toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);

    // @ Mention detection (only in group chats)
    if (isGroup && participants && participants.length > 0) {
      const cursorPos = e.target.selectionStart ?? val.length;
      const textBeforeCursor = val.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
      if (atMatch) {
        setShowMentions(true);
        setMentionQuery(atMatch[1] || '');
        setMentionStartIdx(cursorPos - atMatch[0].length);
      } else {
        setShowMentions(false);
        setMentionQuery('');
        setMentionStartIdx(-1);
      }
    }
  };

  // Wrap selected text with formatting characters (used by keyboard shortcuts)
  const applyWrapper = useCallback((wrapper: string) => {
    const input = textInputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    if (start === end) {
      const newText = text.slice(0, start) + wrapper + wrapper + text.slice(end);
      setText(newText);
      setTimeout(() => { input.setSelectionRange(start + wrapper.length, start + wrapper.length); input.focus(); }, 0);
    } else {
      const selected = text.slice(start, end);
      const newText = text.slice(0, start) + wrapper + selected + wrapper + text.slice(end);
      setText(newText);
      setTimeout(() => { input.setSelectionRange(start + wrapper.length, end + wrapper.length); input.focus(); }, 0);
    }
  }, [text]);

  const handleMentionSelect = (name: string) => {
    if (mentionStartIdx < 0) return;
    const before = text.slice(0, mentionStartIdx);
    const cursorPos = textInputRef.current?.selectionStart ?? text.length;
    const after = text.slice(cursorPos);
    const newText = `${before}@${name} ${after}`;
    setText(newText);
    setShowMentions(false);
    setMentionQuery('');
    setMentionStartIdx(-1);
    setTimeout(() => {
      const pos = before.length + name.length + 2; // @Name + space
      textInputRef.current?.setSelectionRange(pos, pos);
      textInputRef.current?.focus();
    }, 0);
  };

  return (
    <div className="bg-[#F0F2F5] dark:bg-[#202C33]">
      {/* Edit mode bar */}
      {editingMessage && (
        <div className="mx-4 bg-white dark:bg-[#2A3942] rounded-t-lg px-3 py-2 flex items-center gap-2 border-l-4 border-[#007BFC]">
          <Pencil size={14} className="text-[#007BFC] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#007BFC]">Edit message</p>
            <p className="text-xs text-gray-500 dark:text-[#8696A0] truncate">{editingMessage.content}</p>
          </div>
          <button
            onClick={() => { onClearEdit?.(); setText(''); }}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-[#3B4A54] text-gray-400 flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Reply bar */}
      {replyMessage && !editingMessage && (
        <div className="mx-4 bg-white dark:bg-[#2A3942] rounded-t-lg px-3 py-2 flex items-center gap-2 border-l-4 border-[#128C7E]">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#128C7E] truncate">
              {replyMessage.senderName || 'You'}
            </p>
            <p className="text-xs text-gray-500 dark:text-[#8696A0] truncate">
              {replyMessage.type !== 'text' ? `[${replyMessage.type}]` : replyMessage.content}
            </p>
          </div>
          <button
            onClick={onClearReply}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-[#3B4A54] text-gray-400 flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef}  type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,application/*" onChange={handleFileSelect} className="hidden" />
      <input ref={photoInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
      <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />

      {/* Formatting toolbar — shown when text is non-empty */}
      {text.trim().length > 0 && !recording && !editingMessage && (
        <FormattingToolbar inputRef={textInputRef} text={text} setText={setText} />
      )}

      {/* Input row */}
      <div className="px-3 py-2">
        {recording ? (
          /* WhatsApp-style recording UI */
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
                mediaRecorderRef.current = null;
                clearInterval(recordingTimerRef.current);
                setRecording(false);
                setRecordingTime(0);
                recordingChunksRef.current = [];
              }}
              className="p-3 rounded-full hover:bg-gray-200 text-gray-500 flex-shrink-0"
              title="Cancel recording"
            >
              <X size={22} />
            </button>
            <div className="flex-1 flex items-center gap-3 bg-white rounded-full px-4 py-3 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-semibold text-red-500 tabular-nums w-10">{formatTime(recordingTime)}</span>
              <span className="text-xs text-gray-400 flex-1">Recording…</span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:bg-[#20BD5B] flex-shrink-0 shadow"
              title="Send voice message"
            >
              <Send size={20} />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex items-end gap-2">

            {/* ── Plus button with popup menu (outside pill, left) ── */}
            <div className="relative flex-shrink-0" ref={attachMenuRef}>
              <button
                type="button"
                onClick={() => { setShowAttachMenu((v) => !v); setShowEmojiPicker(false); }}
                disabled={uploading}
                className="w-12 h-12 rounded-full bg-white dark:bg-[#2A3942] text-[#54656F] dark:text-[#8696A0] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#3B4A54] disabled:opacity-40 shadow-sm transition-colors"
                title="Attach"
              >
                <Plus size={22} className={`transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`} />
              </button>

              {/* Popup menu */}
              {showAttachMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-[#233138] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 py-2 min-w-[190px] z-30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#7B61FF] flex items-center justify-center flex-shrink-0">
                      <FileText size={18} className="text-white" />
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">Document</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { photoInputRef.current?.click(); setShowAttachMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#007BFC] flex items-center justify-center flex-shrink-0">
                      <Image size={18} className="text-white" />
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">Photos &amp; videos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { photoInputRef.current?.click(); setShowAttachMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#FF2E74] flex items-center justify-center flex-shrink-0">
                      <Camera size={18} className="text-white" />
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { audioInputRef.current?.click(); setShowAttachMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#FF9500] flex items-center justify-center flex-shrink-0">
                      <Headphones size={18} className="text-white" />
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">Audio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAttachMenu(false); setShowPollCreator(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#00A884] flex items-center justify-center flex-shrink-0">
                      <BarChart2 size={18} className="text-white" />
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">Poll</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAttachMenu(false); setShowLocationPicker(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#1DA1F2] flex items-center justify-center flex-shrink-0">
                      <MapPin size={18} className="text-white" />
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">Location</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAttachMenu(false); setShowContactPicker(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942] text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#0795DC] flex items-center justify-center flex-shrink-0">
                      <User size={18} className="text-white" />
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">Contact</span>
                  </button>
                </div>
              )}
            </div>

            {/* ── White pill: emoji + input ── */}
            {/* Outer wrapper holds the emojiPickerRef so the popup renders outside overflow-hidden */}
            <div className="relative flex-1 min-w-0" ref={emojiPickerRef}>
              {/* Full emoji picker — emoji-picker-element web component */}
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-2xl border border-gray-200 z-30 overflow-hidden">
                  <EmojiPickerWrapper onSelect={(emoji) => { insertEmoji(emoji); setShowEmojiPicker(false); }} />
                </div>
              )}

              {/* @ Mention dropdown */}
              {showMentions && filteredMentions.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-2xl border border-gray-200 z-30 min-w-[200px] max-h-48 overflow-y-auto">
                  {filteredMentions.map((p) => (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() => handleMentionSelect(p.name || p.userId)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-[#128C7E]/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#128C7E] text-xs font-bold">{(p.name || '?')[0]?.toUpperCase()}</span>
                      </div>
                      <span className="text-sm text-gray-800">{p.name || p.userId}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center bg-white dark:bg-[#2A3942] rounded-full shadow-sm overflow-hidden">
                {/* Emoji button */}
                <button
                  type="button"
                  onClick={() => { setShowEmojiPicker((v) => !v); setShowAttachMenu(false); }}
                  className="p-3 text-[#54656F] hover:text-[#128C7E] transition-colors flex-shrink-0"
                  title="Emoji"
                >
                  <Smile size={22} />
                </button>

                {/* Text input */}
                <input
                  ref={textInputRef}
                  type="text"
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={(e) => {
                    // Formatting keyboard shortcuts
                    const isMod = e.ctrlKey || e.metaKey;
                    if (!isMod) return;
                    const wrappers: Record<string, string> = { b: '*', i: '_', e: '`' };
                    if (e.shiftKey && e.key.toLowerCase() === 's') {
                      e.preventDefault();
                      applyWrapper('~');
                    } else if (wrappers[e.key.toLowerCase()]) {
                      e.preventDefault();
                      applyWrapper(wrappers[e.key.toLowerCase()]);
                    }
                  }}
                  placeholder={editingMessage ? "Edit message..." : "Type a message"}
                  className={`flex-1 py-3 pr-3 bg-transparent text-sm text-gray-800 dark:text-[#E9EDEF] placeholder-[#8696A0] outline-none min-w-0 ${editingMessage ? 'border-b-2 border-[#007BFC]/30' : ''}`}
                />
              </div>
            </div>

            {/* ── Green circle: Send / Edit / Mic ── */}
            {text.trim() ? (
              <button
                type="submit"
                disabled={uploading}
                className={`w-12 h-12 rounded-full text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0 shadow transition-colors ${
                  editingMessage
                    ? 'bg-[#007BFC] hover:bg-[#0066D6]'
                    : 'bg-[#25D366] hover:bg-[#20BD5B]'
                }`}
                title={editingMessage ? 'Save edit' : 'Send'}
              >
                {editingMessage ? <Check size={20} /> : <Send size={20} />}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={uploading}
                className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:bg-[#20BD5B] disabled:opacity-50 flex-shrink-0 shadow transition-colors"
                title="Record voice message"
              >
                <Mic size={20} />
              </button>
            )}
          </form>
        )}
      </div>

      {/* Media Preview Modal */}
      {mediaPreview && (() => {
        const isDoc = mediaPreview.type === 'document';
        const isAudio = mediaPreview.type === 'audio';
        const ext = (mediaPreview.fileName || mediaPreview.file.name).split('.').pop()?.toUpperCase() || 'FILE';
        const isPdf = ext === 'PDF';
        const isWord = ['DOC', 'DOCX'].includes(ext);
        const iconBg = isPdf ? 'bg-red-100' : isWord ? 'bg-blue-100' : 'bg-gray-100';
        const iconColor = isPdf ? 'text-red-600' : isWord ? 'text-blue-600' : 'text-gray-600';

        const dismiss = () => {
          if (mediaPreview.url) URL.revokeObjectURL(mediaPreview.url);
          setMediaPreview(null);
          setCaption('');
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl">
              {/* Header */}
              <div className="px-4 py-3 bg-[#128C7E] flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {isDoc ? 'Send Document' : isAudio ? 'Send Audio' : mediaPreview.type === 'image' ? 'Send Photo' : 'Send Video'}
                </span>
                <button onClick={dismiss} className="p-1 rounded-full hover:bg-white/20 text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="p-4">
                {/* Document card */}
                {(isDoc || isAudio) && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${iconBg}`}>
                      {isAudio ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-purple-600">
                          <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2"/>
                          <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      ) : isPdf || isWord ? (
                        <FileText size={24} className={iconColor} />
                      ) : (
                        <FileIcon size={24} className={iconColor} />
                      )}
                      <span className={`text-[9px] font-bold mt-0.5 ${isAudio ? 'text-purple-600' : iconColor}`}>{ext}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 break-all leading-snug">
                        {mediaPreview.fileName || mediaPreview.file.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {mediaPreview.fileSize || formatFileSize(mediaPreview.file.size)}
                        {isPdf && ' · PDF'}
                        {isWord && ' · Word'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Image preview */}
                {mediaPreview.type === 'image' && (
                  <img
                    src={mediaPreview.url}
                    alt="Preview"
                    className="w-full max-h-72 object-contain rounded-xl bg-gray-50"
                  />
                )}

                {/* Video preview */}
                {mediaPreview.type === 'video' && (
                  <video
                    src={mediaPreview.url}
                    controls
                    className="w-full max-h-72 rounded-xl bg-black"
                  />
                )}

                {/* Caption (not for audio) */}
                {!isAudio && (
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder={isDoc ? 'Add a message...' : 'Add a caption...'}
                    className="mt-3 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#128C7E]/50"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendMedia(); }}
                  />
                )}

                {/* View Once toggle — for images and videos */}
                {(mediaPreview.type === 'image' || mediaPreview.type === 'video') && (
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <div
                      className={`w-10 h-5 rounded-full flex items-center transition-colors ${viewOnce ? 'bg-[#128C7E]' : 'bg-gray-300'}`}
                      onClick={() => setViewOnce(!viewOnce)}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${viewOnce ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-xs text-gray-600">View once</span>
                  </label>
                )}
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 flex gap-2">
                <button
                  onClick={dismiss}
                  className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMedia}
                  disabled={uploading}
                  className="flex-1 py-2.5 rounded-full bg-[#128C7E] text-white text-sm font-semibold hover:bg-[#075E54] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Send
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Poll Creator Modal */}
      {showPollCreator && (
        <PollCreator
          onSubmit={async (poll) => {
            setShowPollCreator(false);
            await sendMessage(conversationId, poll.question, {
              type: 'poll' as any,
              poll: { question: poll.question, options: poll.options.map((o) => ({ text: o, voters: [] })), allowMultiple: poll.allowMultiple },
            } as any);
            onSend?.();
          }}
          onClose={() => setShowPollCreator(false)}
        />
      )}

      {/* GIF Picker */}
      {showGifPicker && (
        <div className="absolute bottom-full left-0 mb-2 z-30">
          <GifPicker
            onSelect={async (gifUrl) => {
              setShowGifPicker(false);
              await sendMessage(conversationId, '', { type: 'image', mediaUrl: gifUrl });
              onSend?.();
            }}
            onClose={() => setShowGifPicker(false)}
          />
        </div>
      )}

      {/* Sticker Picker */}
      {showStickerPicker && (
        <div className="absolute bottom-full left-0 mb-2 z-30">
          <StickerPicker
            onSelect={async (stickerUrl) => {
              setShowStickerPicker(false);
              await sendMessage(conversationId, '', { type: 'image', mediaUrl: stickerUrl });
              onSend?.();
            }}
            onClose={() => setShowStickerPicker(false)}
          />
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          onSubmit={async (location) => {
            setShowLocationPicker(false);
            await sendMessage(conversationId, location.name || 'Shared location', {
              type: 'location' as any,
              location,
            } as any);
            onSend?.();
          }}
          onClose={() => setShowLocationPicker(false)}
        />
      )}

      {/* Contact Picker Modal */}
      {showContactPicker && (
        <ContactPickerModal
          conversationId={conversationId}
          onClose={() => setShowContactPicker(false)}
          onSend={onSend}
        />
      )}
    </div>
  );
}

// Contact Picker — shows app users for sharing as contact cards
function ContactPickerModal({ conversationId, onClose, onSend }: { conversationId: string; onClose: () => void; onSend?: () => void }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const { sendMessage } = useChatStore();

  useEffect(() => {
    // Load contacts from conversations participants
    const convs = useChatStore.getState().conversations;
    const seen = new Set<string>();
    const users: any[] = [];
    for (const c of convs) {
      for (const p of c.participants || []) {
        if (!seen.has(p.userId)) {
          seen.add(p.userId);
          users.push({ userId: p.userId, name: p.name || 'Unknown', profilePictureUrl: p.profilePictureUrl });
        }
      }
    }
    setContacts(users);
  }, []);

  const filtered = contacts.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSendContact = async (contact: any) => {
    setSending(true);
    try {
      await sendMessage(conversationId, JSON.stringify({ name: contact.name, phone: contact.userId, avatar: contact.profilePictureUrl }), { type: 'contact' as any });
      onSend?.();
      onClose();
    } catch (err) {
      console.error('Failed to send contact:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 bg-[#128C7E] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Share Contact</span>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 text-white"><X size={18} /></button>
        </div>
        <div className="p-3 border-b border-gray-100">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none focus:ring-2 focus:ring-[#128C7E]/30"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.userId}
              onClick={() => handleSendContact(c)}
              disabled={sending}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-full bg-[#128C7E]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {c.profilePictureUrl ? (
                  <img src={c.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[#128C7E] font-bold">{c.name[0]?.toUpperCase()}</span>
                )}
              </div>
              <span className="text-sm font-medium text-gray-800">{c.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">No contacts found</p>
          )}
        </div>
      </div>
    </div>
  );
}
