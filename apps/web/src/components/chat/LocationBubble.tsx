import { MapPin, ExternalLink, Radio } from 'lucide-react';
import { useState, useEffect } from 'react';

interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  isLive?: boolean;
  expiresAt?: string;
  updatedAt?: string;
}

interface Props {
  location: LocationData;
  isOwn: boolean;
}

export default function LocationBubble({ location, isOwn }: Props) {
  const { latitude, longitude, name, address, isLive, expiresAt } = location;
  const [timeLeft, setTimeLeft] = useState('');

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  // Use OpenStreetMap static tile image for map preview
  const zoom = 15;
  const osmTileUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.008},${latitude - 0.005},${longitude + 0.008},${latitude + 0.005}&layer=mapnik&marker=${latitude},${longitude}`;

  // Live location countdown timer
  useEffect(() => {
    if (!isLive || !expiresAt) return;
    const updateTimer = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(mins > 0 ? `${mins}m ${secs}s remaining` : `${secs}s remaining`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isLive, expiresAt]);

  return (
    <div className="min-w-[240px] max-w-[300px] rounded-xl overflow-hidden">
      {/* Live location badge */}
      {isLive && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#128C7E] text-white">
          <Radio size={14} className="animate-pulse" />
          <span className="text-xs font-semibold">Live Location</span>
          {timeLeft && (
            <span className="text-[10px] ml-auto opacity-80">{timeLeft}</span>
          )}
        </div>
      )}

      {/* Map preview — real OpenStreetMap embed */}
      <a
        href={googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative group"
      >
        <div className="h-[140px] bg-[#E8E8E8] dark:bg-[#2A3942] relative overflow-hidden">
          <iframe
            src={osmTileUrl}
            width="100%"
            height="100%"
            style={{ border: 0, pointerEvents: 'none' }}
            loading="lazy"
            title="Location map"
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-[#233138]/90 rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow">
              <ExternalLink size={12} className="text-[#128C7E]" />
              <span className="text-xs font-medium text-[#128C7E]">Open in Maps</span>
            </div>
          </div>
        </div>
      </a>

      {/* Location info */}
      <div className="px-2 pt-2">
        {name && (
          <p className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF] leading-tight flex items-center gap-1.5">
            <MapPin size={14} className="text-red-500 flex-shrink-0" />
            {name}
          </p>
        )}
        {address && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug pl-[22px]">
            {address}
          </p>
        )}
        {!name && !address && (
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <MapPin size={14} className="text-red-500 flex-shrink-0" />
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </p>
        )}
      </div>
    </div>
  );
}
