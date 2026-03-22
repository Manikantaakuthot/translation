import { useState } from 'react';

const EMOJIS = ['😀', '😊', '🥰', '😎', '👍', '❤️', '🔥', '😂', '😢', '😡', '🤔', '👋', '🎉', '✅', '❌', '⭐', '💯', '🙏', '😴', '🤗'];

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}

export default function EmojiPicker({ onSelect, onClose, className = '' }: Props) {
  const [search, setSearch] = useState('');

  const filtered = EMOJIS.filter((e) => !search || e.includes(search));

  return (
    <div
      className={`absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50 ${className}`}
    >
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search emoji"
        className="w-full px-2 py-1 text-sm border border-gray-200 rounded mb-2"
      />
      <div className="grid grid-cols-5 gap-1 max-h-32 overflow-y-auto">
        {filtered.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="p-1 hover:bg-gray-100 rounded text-xl"
          >
            {emoji}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 text-xs text-gray-500 hover:text-gray-700"
      >
        Close
      </button>
    </div>
  );
}
