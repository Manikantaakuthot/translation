import { useState, useEffect } from 'react';
import { X, MapPin, Navigation, Loader2, Search, Radio, Clock } from 'lucide-react';

interface LocationResult {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  isLive?: boolean;
  liveDuration?: number; // minutes
}

interface Props {
  onSubmit: (location: LocationResult) => void;
  onClose: () => void;
}

export default function LocationPicker({ onSubmit, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ lat: number; lon: number; display_name: string }[]>([]);
  const [tab, setTab] = useState<'current' | 'live' | 'search'>('current');
  const [liveDuration, setLiveDuration] = useState(15); // 15 min default

  // Get current position on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      setTab('search');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLoading(false);
        // Reverse geocode
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
        )
          .then((r) => r.json())
          .then((data) => {
            if (data?.display_name) {
              const parts = data.display_name.split(', ');
              setName(parts[0] || 'Current Location');
              setAddress(parts.slice(1, 4).join(', '));
            }
          })
          .catch(() => {});
      },
      (err) => {
        setError(
          err.code === 1 ? 'Location permission denied. Search for a location below.' : 'Unable to get your location'
        );
        setLoading(false);
        setTab('search');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.trim())}&limit=5`
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setSearchResults(data.map((r: any) => ({ lat: parseFloat(r.lat), lon: parseFloat(r.lon), display_name: r.display_name })));
      }
    } catch {}
    setSearching(false);
  };

  const selectSearchResult = (result: { lat: number; lon: number; display_name: string }) => {
    const parts = result.display_name.split(', ');
    setLocation({ latitude: result.lat, longitude: result.lon });
    setName(parts[0] || '');
    setAddress(parts.slice(1, 4).join(', '));
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleSendCurrent = () => {
    if (!location) return;
    onSubmit({ latitude: location.latitude, longitude: location.longitude, name: name || 'Current Location', address: address || undefined });
  };

  const handleSendLive = () => {
    if (!location) return;
    onSubmit({
      latitude: location.latitude,
      longitude: location.longitude,
      name: name || 'Live Location',
      address: address || undefined,
      isLive: true,
      liveDuration,
    });
  };

  const handleSendSearch = () => {
    if (!location) return;
    onSubmit({ latitude: location.latitude, longitude: location.longitude, name: name || undefined, address: address || undefined });
  };

  const osmEmbedUrl = location
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.longitude - 0.008},${location.latitude - 0.005},${location.longitude + 0.008},${location.latitude + 0.005}&layer=mapnik&marker=${location.latitude},${location.longitude}`
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#233138] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#128C7E] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-white" />
            <span className="text-sm font-semibold text-white">Share Location</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 text-white">
            <X size={18} />
          </button>
        </div>

        {/* Tabs — WhatsApp style */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={() => setTab('current')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'current'
                ? 'text-[#128C7E] border-b-2 border-[#128C7E]'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Navigation size={14} />
            Current
          </button>
          <button
            onClick={() => setTab('live')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'live'
                ? 'text-[#128C7E] border-b-2 border-[#128C7E]'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Radio size={14} />
            Live
          </button>
          <button
            onClick={() => setTab('search')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'search'
                ? 'text-[#128C7E] border-b-2 border-[#128C7E]'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Search size={14} />
            Search
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 size={32} className="text-[#128C7E] animate-spin" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Getting your location...</p>
            </div>
          )}

          {/* ─── CURRENT LOCATION TAB ─── */}
          {!loading && tab === 'current' && (
            <div className="space-y-4">
              {location ? (
                <>
                  {/* Real map embed */}
                  <div className="h-[180px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                    <iframe
                      src={osmEmbedUrl}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      title="Your location"
                    />
                  </div>

                  {/* Location info */}
                  <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-[#2A3942] rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center flex-shrink-0">
                      <Navigation size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-[#E9EDEF]">{name || 'Current Location'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {address || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}
                      </p>
                    </div>
                  </div>

                  {/* Send button */}
                  <button
                    onClick={handleSendCurrent}
                    className="w-full py-3 rounded-full bg-[#128C7E] text-white text-sm font-semibold hover:bg-[#075E54] flex items-center justify-center gap-2 transition-colors"
                  >
                    <Navigation size={16} />
                    Send your current location
                  </button>
                </>
              ) : (
                <div className="text-center py-6">
                  <MapPin size={32} className="text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">{error || 'Unable to get location'}</p>
                  <button
                    onClick={() => setTab('search')}
                    className="mt-3 px-4 py-2 rounded-full bg-[#128C7E] text-white text-xs font-medium"
                  >
                    Search instead
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── LIVE LOCATION TAB ─── */}
          {!loading && tab === 'live' && (
            <div className="space-y-4">
              {location ? (
                <>
                  {/* Live indicator */}
                  <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-[#1A3A2A] rounded-xl border border-green-200 dark:border-green-800">
                    <div className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center flex-shrink-0">
                      <Radio size={18} className="text-white animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-[#E9EDEF]">Share Live Location</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Your location will update in real-time for the selected duration
                      </p>
                    </div>
                  </div>

                  {/* Duration selector — WhatsApp style */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Clock size={12} />
                      Share for
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '15 min', value: 15 },
                        { label: '1 hour', value: 60 },
                        { label: '8 hours', value: 480 },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setLiveDuration(opt.value)}
                          className={`py-3 rounded-xl text-sm font-medium transition-all ${
                            liveDuration === opt.value
                              ? 'bg-[#128C7E] text-white shadow-md scale-[1.02]'
                              : 'bg-gray-100 dark:bg-[#2A3942] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#354950]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Map preview */}
                  <div className="h-[140px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                    <iframe
                      src={osmEmbedUrl}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      title="Your live location"
                    />
                  </div>

                  {/* Send live location button */}
                  <button
                    onClick={handleSendLive}
                    className="w-full py-3 rounded-full bg-[#128C7E] text-white text-sm font-semibold hover:bg-[#075E54] flex items-center justify-center gap-2 transition-colors"
                  >
                    <Radio size={16} className="animate-pulse" />
                    Share live location
                  </button>
                </>
              ) : (
                <div className="text-center py-6">
                  <Radio size={32} className="text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Location access needed for live sharing</p>
                  <p className="text-xs text-gray-400 mt-1">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ─── SEARCH TAB ─── */}
          {!loading && tab === 'search' && (
            <div className="space-y-3">
              {/* Search input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="Search city, place, or address..."
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2A3942] text-sm text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#128C7E]/40"
                  autoFocus
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-3 py-2.5 rounded-xl bg-[#128C7E] text-white disabled:opacity-40 flex items-center justify-center"
                >
                  {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                </button>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
                  {searchResults.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectSearchResult(r)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-[#2A3942] flex items-start gap-2"
                    >
                      <MapPin size={14} className="text-[#128C7E] mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-gray-700 dark:text-[#E9EDEF] leading-snug">{r.display_name}</span>
                    </button>
                  ))}
                </div>
              )}

              {searching && (
                <div className="text-center py-3">
                  <Loader2 size={20} className="text-[#128C7E] animate-spin mx-auto" />
                  <p className="text-xs text-gray-400 mt-1">Searching...</p>
                </div>
              )}

              {/* Quick preset locations */}
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Popular places:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
                    { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
                    { name: 'Delhi', lat: 28.6139, lon: 77.209 },
                    { name: 'Bangalore', lat: 12.9716, lon: 77.5946 },
                    { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
                    { name: 'New York', lat: 40.7128, lon: -74.006 },
                  ].map((city) => (
                    <button
                      key={city.name}
                      onClick={() => selectSearchResult({ lat: city.lat, lon: city.lon, display_name: `${city.name}, India` })}
                      className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-[#2A3942] text-xs text-gray-600 dark:text-gray-300 hover:bg-[#128C7E]/20 hover:text-[#128C7E] transition-colors"
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected location preview */}
              {location && (
                <div className="space-y-3 mt-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="h-[140px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                    <iframe
                      src={osmEmbedUrl}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      title="Selected location"
                    />
                  </div>

                  <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-[#2A3942] rounded-lg">
                    <MapPin size={14} className="text-red-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 dark:text-[#E9EDEF] truncate">{name}</p>
                      {address && <p className="text-[10px] text-gray-500 truncate">{address}</p>}
                    </div>
                  </div>

                  <button
                    onClick={handleSendSearch}
                    className="w-full py-2.5 rounded-full bg-[#128C7E] text-white text-sm font-semibold hover:bg-[#075E54] flex items-center justify-center gap-2"
                  >
                    <MapPin size={16} />
                    Share this location
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
