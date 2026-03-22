import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Phone, Video } from 'lucide-react';
import { useCallStore } from '../store/callStore';
import { format } from 'date-fns';

export default function Calls() {
  const { callHistory, loadHistory } = useCallStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory().finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] w-full">
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] flex items-center gap-3 bg-[#128C7E] dark:bg-[#202C33]">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-white/10">
          <ArrowLeft size={24} className="text-white" />
        </Link>
        <h1 className="text-xl font-semibold text-white">Call History</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-[#8696A0]">Loading...</div>
        ) : (callHistory || []).length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-[#8696A0]">
            <Phone size={48} className="mx-auto mb-2 opacity-50" />
            <p>No call history</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#2A3942]">
            {(callHistory || []).map((call) => (
              <div
                key={call.id}
                className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-[#2A3942]"
              >
                <div className="w-12 h-12 rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] dark:text-[#00A884] font-bold">
                  {(call.callerName || call.calleeName || '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 dark:text-[#E9EDEF] truncate">
                    {call.callerName || call.calleeName}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-[#8696A0]">
                    {call.createdAt && format(new Date(call.createdAt), 'MMM d, HH:mm')} •{' '}
                    {call.type === 'video' ? 'Video' : 'Voice'} • {call.status}
                    {call.duration ? ` • ${call.duration}s` : ''}
                  </p>
                </div>
                <div className="text-gray-400 dark:text-[#8696A0]">
                  {call.type === 'video' ? <Video size={20} /> : <Phone size={20} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
