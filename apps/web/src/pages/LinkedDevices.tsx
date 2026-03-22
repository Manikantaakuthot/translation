import { useState, useEffect } from 'react';
import { ArrowLeft, Smartphone, Monitor, Tablet, Trash2, Loader2, Plus, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface DeviceSession {
  id: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'web';
  lastActiveAt: string;
  browser?: string;
  os?: string;
  isCurrent: boolean;
}

export default function LinkedDevices() {
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/devices');
      const list = Array.isArray(data) ? data : [];
      // Backend returns lastActive; normalize to lastActiveAt for UI
      setDevices(
        list.map((d: any) => ({
          id: d.id,
          deviceName: d.deviceName,
          deviceType: d.deviceType,
          lastActiveAt: d.lastActive || d.lastActiveAt || new Date().toISOString(),
          browser: d.browser,
          os: d.os,
          isCurrent: false,
        })),
      );
    } catch {
      // Create mock current device if endpoint doesn't exist yet
      setDevices([
        {
          id: 'current',
          deviceName: navigator.userAgent.includes('Mac') ? 'macOS' : navigator.userAgent.includes('Win') ? 'Windows' : 'Linux',
          deviceType: 'web',
          lastActiveAt: new Date().toISOString(),
          browser: navigator.userAgent.match(/(Chrome|Firefox|Safari|Edge)\//)?.[1] || 'Browser',
          os: navigator.platform,
          isCurrent: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    if (!confirm('Remove this device? It will be logged out.')) return;
    try {
      await api.post(`/auth/devices/${deviceId}/revoke`);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch (err) {
      console.error('Failed to remove device:', err);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone size={24} className="text-[#128C7E]" />;
      case 'desktop':
        return <Monitor size={24} className="text-[#128C7E]" />;
      case 'tablet':
        return <Tablet size={24} className="text-[#128C7E]" />;
      default:
        return <Monitor size={24} className="text-[#128C7E]" />;
    }
  };

  const formatLastActive = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      if (diff < 60000) return 'Active now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] h-full">
      {/* Header */}
      <div className="bg-[#128C7E] dark:bg-[#202C33] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link to="/settings" className="p-1.5 -ml-1.5 rounded-full hover:bg-white/15">
          <ArrowLeft size={22} className="text-white" />
        </Link>
        <h1 className="text-lg font-semibold text-white">Linked Devices</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Link new device section */}
        <div className="px-6 py-8 text-center border-b border-gray-100 dark:border-[#2A3942]">
          <div className="w-20 h-20 rounded-full bg-[#F0F2F5] dark:bg-[#2A3942] flex items-center justify-center mx-auto mb-4">
            <QrCode size={36} className="text-[#128C7E]" />
          </div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-[#E9EDEF] mb-2">
            Use MQ on other devices
          </h2>
          <p className="text-sm text-[#8696A0] mb-4 max-w-xs mx-auto">
            Link your phone to access MQ on up to 4 other devices at the same time.
          </p>
          <button
            className="px-5 py-2.5 bg-[#128C7E] text-white text-sm font-semibold rounded-full hover:bg-[#075E54] transition-colors inline-flex items-center gap-2"
          >
            <Plus size={16} />
            Link a Device
          </button>
        </div>

        {/* Device list */}
        <div className="px-4 py-4">
          <h3 className="text-xs font-semibold text-[#128C7E] uppercase tracking-wider px-2 mb-3">
            Active Sessions
          </h3>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="text-[#128C7E] animate-spin" />
            </div>
          )}

          {!loading && devices.length === 0 && (
            <p className="text-sm text-[#8696A0] text-center py-8">No linked devices</p>
          )}

          <div className="space-y-1">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F6F6] dark:hover:bg-[#2A3942] transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-[#F0F2F5] dark:bg-[#2A3942] flex items-center justify-center flex-shrink-0">
                  {getDeviceIcon(device.deviceType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF] truncate">
                      {device.deviceName}
                    </p>
                    {device.isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#25D366]/10 text-[#25D366] font-semibold">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8696A0] mt-0.5">
                    {device.browser && `${device.browser} · `}
                    {formatLastActive(device.lastActiveAt)}
                  </p>
                </div>
                {!device.isCurrent && (
                  <button
                    onClick={() => handleRemoveDevice(device.id)}
                    className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove device"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Security note */}
        <div className="px-6 py-4 text-center">
          <p className="text-xs text-[#8696A0] leading-relaxed">
            MQ is available for phones, tablets, and computers.
            Your personal messages are end-to-end encrypted on all your devices.
          </p>
        </div>
      </div>
    </div>
  );
}
