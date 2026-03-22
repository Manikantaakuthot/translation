import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { stickersApi } from '../../api/client';

interface Sticker {
  id: string;
  url: string;
  emoji?: string;
}

interface StickerPack {
  id: string;
  name: string;
  icon: string;
  stickers: Sticker[];
}

interface Props {
  onSelect: (stickerUrl: string) => void;
  onClose: () => void;
}

export default function StickerPicker({ onSelect, onClose }: Props) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [activePack, setActivePack] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    stickersApi.getPacks()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setPacks(list);
        if (list.length > 0) setActivePack(list[0].id);
      })
      .catch(() => setPacks([]))
      .finally(() => setLoading(false));
  }, []);

  const currentPack = packs.find((p) => p.id === activePack);
  const stickers = currentPack?.stickers || [];

  const filteredStickers = searchQuery.trim()
    ? stickers.filter((s) =>
        (s.emoji || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : stickers;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[320px] h-[400px] bg-white dark:bg-[#233138] rounded-xl shadow-2xl border border-gray-200 dark:border-[#2A3942] z-30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-[#2A3942]">
        <span className="text-sm font-semibold text-gray-800 dark:text-[#E9EDEF]">Stickers</span>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-[#2A3942]">
          <X size={16} className="text-gray-500 dark:text-[#8696A0]" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center bg-gray-100 dark:bg-[#2A3942] rounded-lg px-2 py-1.5 gap-2">
          <Search size={14} className="text-gray-400 dark:text-[#8696A0]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stickers..."
            className="bg-transparent flex-1 text-xs text-gray-700 dark:text-[#E9EDEF] placeholder-gray-400 dark:placeholder-[#8696A0] outline-none"
          />
        </div>
      </div>

      {/* Pack tabs */}
      {packs.length > 0 && (
        <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
          {packs.map((pack) => (
            <button
              key={pack.id}
              onClick={() => setActivePack(pack.id)}
              className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-colors ${
                activePack === pack.id
                  ? 'bg-[#128C7E]/20 ring-1 ring-[#128C7E]'
                  : 'hover:bg-gray-100 dark:hover:bg-[#2A3942]'
              }`}
              title={pack.name}
            >
              {pack.icon || pack.name?.[0] || '📦'}
            </button>
          ))}
        </div>
      )}

      {/* Sticker grid */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="grid grid-cols-4 gap-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-gray-200 dark:bg-[#2A3942] animate-pulse" />
            ))}
          </div>
        ) : packs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-sm text-gray-500 dark:text-[#8696A0]">No sticker packs available</p>
            <p className="text-xs text-gray-400 dark:text-[#8696A0] mt-1">Sticker packs will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filteredStickers.map((sticker) => (
              <button
                key={sticker.id}
                onClick={() => onSelect(sticker.url)}
                className="aspect-square rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A3942] p-1 transition-colors"
                title={sticker.emoji}
              >
                <img
                  src={sticker.url}
                  alt={sticker.emoji || 'sticker'}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
