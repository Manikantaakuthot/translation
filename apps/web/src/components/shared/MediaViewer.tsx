import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { format } from 'date-fns';

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  mediaUrl: string;
  senderName?: string;
  createdAt?: string;
}

interface Props {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

export default function MediaViewer({ items, initialIndex, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);

  const currentItem = items[currentIndex];

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = '';
    };
  }, []);

  const goNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setZoomed(false);
      setSlideDirection('left');
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, items.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setZoomed(false);
      setSlideDirection('right');
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  useEffect(() => {
    if (slideDirection) {
      const timeout = setTimeout(() => setSlideDirection(null), 300);
      return () => clearTimeout(timeout);
    }
  }, [slideDirection, currentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goNext, goPrev]);

  const handleDownload = () => {
    window.open(currentItem.mediaUrl, '_blank');
  };

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return '';
    try { return format(new Date(dateStr), 'MMM d, yyyy h:mm a'); } catch { return ''; }
  };

  const slideClass = slideDirection === 'left'
    ? 'animate-slide-left'
    : slideDirection === 'right'
    ? 'animate-slide-right'
    : '';

  if (!currentItem) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-black select-none transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {currentItem.senderName && (
            <div>
              <p className="text-white font-semibold text-sm truncate">{currentItem.senderName}</p>
              {currentItem.createdAt && (
                <p className="text-white/60 text-xs mt-0.5">{formatTimestamp(currentItem.createdAt)}</p>
              )}
            </div>
          )}
          {!currentItem.senderName && currentItem.createdAt && (
            <p className="text-white/60 text-sm">{formatTimestamp(currentItem.createdAt)}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={handleDownload} className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors" title="Download">
            <Download size={20} />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors" title="Close">
            <X size={22} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0">
        {currentIndex > 0 && (
          <button onClick={goPrev} className="absolute left-2 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors">
            <ChevronLeft size={28} />
          </button>
        )}

        <div key={currentItem.id} className={`flex items-center justify-center w-full h-full transition-transform duration-300 ease-in-out ${slideClass}`}>
          {currentItem.type === 'image' && (
            <img
              src={currentItem.mediaUrl}
              alt={currentItem.senderName || 'Media'}
              draggable={false}
              onClick={() => setZoomed((z) => !z)}
              className={`max-w-full max-h-full transition-all duration-300 ${
                zoomed ? 'object-cover cursor-zoom-out scale-150' : 'object-contain cursor-zoom-in'
              }`}
            />
          )}
          {currentItem.type === 'video' && (
            <video key={currentItem.id} src={currentItem.mediaUrl} controls autoPlay playsInline className="max-w-full max-h-full" />
          )}
        </div>

        {currentIndex < items.length - 1 && (
          <button onClick={goNext} className="absolute right-2 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors">
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 overflow-x-auto z-10">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => { setZoomed(false); setSlideDirection(index > currentIndex ? 'left' : 'right'); setCurrentIndex(index); }}
              className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                index === currentIndex ? 'border-white opacity-100 scale-105' : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              {item.type === 'image' ? (
                <img src={item.mediaUrl} alt="" draggable={false} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-white/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6"><path d="M8 5v14l11-7z" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes slide-in-from-right { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slide-in-from-left { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-slide-left { animation: slide-in-from-right 0.3s ease-in-out; }
        .animate-slide-right { animation: slide-in-from-left 0.3s ease-in-out; }
      `}</style>
    </div>
  );
}
