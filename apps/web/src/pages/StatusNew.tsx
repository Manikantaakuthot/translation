import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, ImagePlus, Type, Video } from 'lucide-react';
import { statusApi, mediaApi } from '../api/client';

const BG_COLORS = [
  '#075E54', // WhatsApp dark green
  '#128C7E', // WhatsApp green
  '#25D366', // WhatsApp light green
  '#1DA1F2', // Blue
  '#9333EA', // Purple
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#1F2937', // Dark
];

export default function StatusNew() {
  const [type, setType] = useState<'text' | 'image' | 'video'>('text');
  const [content, setContent] = useState('');
  const [backgroundColor, setBackgroundColor] = useState(BG_COLORS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'text' && !content.trim()) return;
    if ((type === 'image' || type === 'video') && !file) return;
    setUploading(true);
    try {
      if (type === 'text') {
        await statusApi.create({ type: 'text', content: content.trim(), backgroundColor });
      } else if (file) {
        const { data } = await mediaApi.upload(file);
        await statusApi.create({ type, mediaUrl: data.mediaUrl });
      }
      navigate('/status');
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      setType('image');
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else if (f.type.startsWith('video/')) {
      setType('video');
      const url = URL.createObjectURL(f);
      setPreview(url);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] w-full h-full">
      {/* Header */}
      <div className="flex items-center gap-3 bg-[#128C7E] dark:bg-[#202C33] px-4 py-3 flex-shrink-0">
        <Link to="/status" className="p-1.5 -ml-1.5 rounded-full hover:bg-white/15">
          <ArrowLeft size={22} className="text-white" />
        </Link>
        <h1 className="text-lg font-semibold text-white flex-1">New Status</h1>

        {/* Type switcher in header */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setType('text')}
            className={`p-2 rounded-full transition-colors ${type === 'text' ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/15'}`}
            title="Text"
          >
            <Type size={18} />
          </button>
          <button
            onClick={() => { setType('image'); fileInputRef.current?.click(); }}
            className={`p-2 rounded-full transition-colors ${type === 'image' ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/15'}`}
            title="Image"
          >
            <ImagePlus size={18} />
          </button>
          <button
            onClick={() => { setType('video'); fileInputRef.current?.click(); }}
            className={`p-2 rounded-full transition-colors ${type === 'video' ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/15'}`}
            title="Video"
          >
            <Video size={18} />
          </button>
        </div>
      </div>

      {/* ── Text Status Creator ── */}
      {type === 'text' && (
        <div
          className="flex-1 flex flex-col"
          style={{ backgroundColor }}
        >
          {/* Text area */}
          <div className="flex-1 flex items-center justify-center p-8">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type a status..."
              className="w-full max-w-sm bg-transparent text-white text-xl text-center font-medium placeholder-white/50 outline-none resize-none border-none"
              rows={4}
              maxLength={700}
            />
          </div>

          {/* Color palette */}
          <div className="flex items-center justify-center gap-3 py-4 px-6 bg-black/20 backdrop-blur-sm">
            {BG_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setBackgroundColor(color)}
                className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: backgroundColor === color ? 'white' : 'transparent',
                }}
              >
                {backgroundColor === color && <Check size={14} className="text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>

          {/* Post button */}
          <div className="py-4 px-6">
            <button
              onClick={handleSubmit}
              disabled={uploading || !content.trim()}
              className="w-full py-3.5 bg-[#25D366] text-white font-semibold rounded-full hover:bg-[#20BD5B] disabled:opacity-50 transition-colors shadow-lg"
            >
              {uploading ? 'Posting...' : 'Post Status'}
            </button>
          </div>
        </div>
      )}

      {/* ── Media Status Creator ── */}
      {(type === 'image' || type === 'video') && (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col bg-[#111]">
          {/* Preview area */}
          <div className="flex-1 flex items-center justify-center relative">
            {preview ? (
              type === 'image' ? (
                <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
              ) : (
                <video src={preview} controls className="max-w-full max-h-full" />
              )
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-3 text-white/50 hover:text-white/80 transition-colors"
              >
                {type === 'image' ? <ImagePlus size={48} /> : <Video size={48} />}
                <span className="text-sm">Tap to select {type}</span>
              </button>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={type === 'image' ? 'image/*' : 'video/*'}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Post button */}
          <div className="py-4 px-6 bg-[#111]">
            {preview && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 mb-2 text-white/60 text-sm hover:text-white/80"
              >
                Choose different {type}
              </button>
            )}
            <button
              type="submit"
              disabled={uploading || !file}
              className="w-full py-3.5 bg-[#25D366] text-white font-semibold rounded-full hover:bg-[#20BD5B] disabled:opacity-50 transition-colors shadow-lg"
            >
              {uploading ? 'Posting...' : 'Post Status'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
