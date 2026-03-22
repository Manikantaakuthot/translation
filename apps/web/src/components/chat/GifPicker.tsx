import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { gifApi } from '../../api/client';

interface GifResult {
  id: string;
  url: string;
  preview: string;
  title: string;
}

interface Props {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = query.trim()
          ? await gifApi.search(query.trim(), 30)
          : await gifApi.trending(30);
        const results = Array.isArray(data) ? data : (data?.results || data?.data || []);
        setGifs(
          results.map((g: any) => ({
            id: g.id || g._id || Math.random().toString(),
            url: g.url || g.media_formats?.gif?.url || g.images?.original?.url || '',
            preview: g.preview || g.media_formats?.tinygif?.url || g.images?.fixed_width_small?.url || g.url || '',
            title: g.title || g.content_description || '',
          }))
        );
      } catch {
        setGifs([]);
      } finally {
        setLoading(false);
      }
    }, query ? 400 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="w-[340px] bg-white dark:bg-[#233138] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">GIF</span>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#2A3942] rounded-lg px-2 py-1.5 flex-1">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs"
            className="bg-transparent text-xs outline-none flex-1 text-gray-700 dark:text-gray-200 placeholder-gray-400"
            autoFocus
          />
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
          <X size={16} className="text-gray-400" />
        </button>
      </div>

      {/* Grid */}
      <div className="max-h-[280px] overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#128C7E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : gifs.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">
            {query ? 'No GIFs found' : 'Loading trending GIFs...'}
          </p>
        ) : (
          <div className="columns-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.url)}
                className="block w-full mb-1.5 rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
              >
                <img
                  src={gif.preview || gif.url}
                  alt={gif.title}
                  className="w-full h-auto object-cover rounded-lg"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Attribution */}
      <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-700 text-center">
        <span className="text-[10px] text-gray-400">Powered by Tenor</span>
      </div>
    </div>
  );
}
