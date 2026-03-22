import { useState } from 'react';
import { X, Check, Palette } from 'lucide-react';

interface Props {
  currentWallpaper: string | null;
  onSelect: (wallpaper: string | null) => void;
  onClose: () => void;
}

const SOLID_COLORS = [
  null, // default (no wallpaper)
  '#ECE5DD', // WhatsApp default beige
  '#D1F2EB', // Mint
  '#D4EFDF', // Light green
  '#E8DAEF', // Lavender
  '#FADBD8', // Blush
  '#FEF9E7', // Cream
  '#D6EAF8', // Sky
  '#F2F3F4', // Silver
  '#1A1A2E', // Dark navy
  '#16213E', // Deep blue
  '#0F3460', // Ocean
  '#1B1B2F', // Midnight
  '#2D2D44', // Charcoal
  '#1A3C40', // Dark teal
  '#0B0B0B', // Nearly black
  '#2C3333', // Dark gray
];

const PATTERN_WALLPAPERS = [
  { id: 'dots', label: 'Dots', css: 'radial-gradient(circle, #00000010 1px, transparent 1px)', size: '20px 20px' },
  { id: 'lines', label: 'Lines', css: 'repeating-linear-gradient(0deg, #00000008, #00000008 1px, transparent 1px, transparent 20px)', size: '' },
  { id: 'grid', label: 'Grid', css: 'linear-gradient(#00000008 1px, transparent 1px), linear-gradient(90deg, #00000008 1px, transparent 1px)', size: '20px 20px' },
  { id: 'diagonal', label: 'Diagonal', css: 'repeating-linear-gradient(45deg, #00000008, #00000008 1px, transparent 1px, transparent 15px)', size: '' },
  { id: 'waves', label: 'Waves', css: 'radial-gradient(ellipse at 50% 0%, #00000010 50%, transparent 50%), radial-gradient(ellipse at 50% 100%, #00000010 50%, transparent 50%)', size: '40px 20px' },
  { id: 'cross', label: 'Cross', css: 'radial-gradient(circle, transparent 20%, #00000008 20%, #00000008 80%, transparent 80%), radial-gradient(circle, transparent 20%, #00000008 20%, #00000008 80%, transparent 80%)', size: '30px 30px' },
];

export default function WallpaperPicker({ currentWallpaper, onSelect, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(currentWallpaper);
  const [tab, setTab] = useState<'solid' | 'pattern'>('solid');

  const handleApply = () => {
    onSelect(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#233138] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 bg-[#128C7E] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-white" />
            <span className="text-sm font-semibold text-white">Chat Wallpaper</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 text-white">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTab('solid')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'solid'
                ? 'text-[#128C7E] border-b-2 border-[#128C7E]'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Solid Colors
          </button>
          <button
            onClick={() => setTab('pattern')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'pattern'
                ? 'text-[#128C7E] border-b-2 border-[#128C7E]'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Patterns
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {tab === 'solid' && (
            <div className="grid grid-cols-5 gap-3">
              {SOLID_COLORS.map((color, index) => (
                <button
                  key={index}
                  onClick={() => setSelected(color)}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:scale-110 ${
                    selected === color ? 'ring-2 ring-[#128C7E] ring-offset-2 dark:ring-offset-[#233138]' : ''
                  }`}
                  style={{
                    backgroundColor: color || '#ECE5DD',
                    border: !color ? '2px dashed #ccc' : 'none',
                  }}
                >
                  {selected === color && <Check size={16} className={`${!color || color.startsWith('#F') || color.startsWith('#E') || color.startsWith('#D') ? 'text-[#128C7E]' : 'text-white'}`} strokeWidth={3} />}
                  {!color && selected !== color && <X size={14} className="text-gray-400" />}
                </button>
              ))}
            </div>
          )}

          {tab === 'pattern' && (
            <div className="grid grid-cols-3 gap-3">
              {PATTERN_WALLPAPERS.map((pattern) => (
                <button
                  key={pattern.id}
                  onClick={() => setSelected(`pattern:${pattern.id}`)}
                  className={`h-20 rounded-xl flex items-end justify-center pb-2 transition-all hover:scale-105 ${
                    selected === `pattern:${pattern.id}` ? 'ring-2 ring-[#128C7E] ring-offset-2 dark:ring-offset-[#233138]' : ''
                  }`}
                  style={{
                    backgroundColor: '#ECE5DD',
                    backgroundImage: pattern.css,
                    backgroundSize: pattern.size || undefined,
                  }}
                >
                  <span className="text-[10px] font-medium text-gray-600 bg-white/80 rounded px-1.5 py-0.5">
                    {pattern.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Preview */}
          <div className="mt-4 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 h-32 flex items-center justify-center"
            style={{
              backgroundColor: (selected && !selected.startsWith('pattern:')) ? selected : '#ECE5DD',
              backgroundImage: selected?.startsWith('pattern:')
                ? PATTERN_WALLPAPERS.find(p => `pattern:${p.id}` === selected)?.css
                : undefined,
              backgroundSize: selected?.startsWith('pattern:')
                ? PATTERN_WALLPAPERS.find(p => `pattern:${p.id}` === selected)?.size || undefined
                : undefined,
            }}
          >
            <div className="bg-white dark:bg-[#202C33] rounded-lg px-3 py-2 shadow-sm max-w-[60%]">
              <p className="text-xs text-gray-800 dark:text-[#E9EDEF]">Preview message bubble</p>
              <p className="text-[9px] text-gray-400 text-right mt-1">12:00</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2A3942]"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2.5 rounded-full bg-[#128C7E] text-white text-sm font-semibold hover:bg-[#075E54]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
