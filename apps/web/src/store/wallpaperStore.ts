import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WallpaperState {
  wallpaper: string | null; // null = default, color string, or "pattern:xxx"
  setWallpaper: (wallpaper: string | null) => void;
  getBackgroundStyle: () => React.CSSProperties;
}

const PATTERN_WALLPAPERS: Record<string, { css: string; size?: string }> = {
  dots: { css: 'radial-gradient(circle, #00000010 1px, transparent 1px)', size: '20px 20px' },
  lines: { css: 'repeating-linear-gradient(0deg, #00000008, #00000008 1px, transparent 1px, transparent 20px)' },
  grid: { css: 'linear-gradient(#00000008 1px, transparent 1px), linear-gradient(90deg, #00000008 1px, transparent 1px)', size: '20px 20px' },
  diagonal: { css: 'repeating-linear-gradient(45deg, #00000008, #00000008 1px, transparent 1px, transparent 15px)' },
  waves: { css: 'radial-gradient(ellipse at 50% 0%, #00000010 50%, transparent 50%), radial-gradient(ellipse at 50% 100%, #00000010 50%, transparent 50%)', size: '40px 20px' },
  cross: { css: 'radial-gradient(circle, transparent 20%, #00000008 20%, #00000008 80%, transparent 80%), radial-gradient(circle, transparent 20%, #00000008 20%, #00000008 80%, transparent 80%)', size: '30px 30px' },
};

export const useWallpaperStore = create<WallpaperState>()(
  persist(
    (set, get) => ({
      wallpaper: null,
      setWallpaper: (wallpaper) => set({ wallpaper }),
      getBackgroundStyle: () => {
        const { wallpaper } = get();
        if (!wallpaper) return { backgroundColor: '#ECE5DD' };
        if (wallpaper.startsWith('pattern:')) {
          const patternId = wallpaper.replace('pattern:', '');
          const pattern = PATTERN_WALLPAPERS[patternId];
          if (pattern) {
            return {
              backgroundColor: '#ECE5DD',
              backgroundImage: pattern.css,
              backgroundSize: pattern.size || undefined,
            } as React.CSSProperties;
          }
        }
        return { backgroundColor: wallpaper };
      },
    }),
    { name: 'msg-wallpaper' }
  )
);
