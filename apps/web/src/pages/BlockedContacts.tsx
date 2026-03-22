import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, UserX } from 'lucide-react';
import { usersApi, api } from '../api/client';

interface BlockedContact {
  _id: string;
  id: string;
  name: string;
  phone: string;
}

export default function BlockedContacts() {
  const [contacts, setContacts] = useState<BlockedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useEffect(() => {
    loadBlockedContacts();
  }, []);

  const loadBlockedContacts = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/users/contacts/blocked');
      setContacts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load blocked contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    try {
      setUnblockingId(userId);
      await usersApi.unblockContact(userId);
      setContacts((prev) => prev.filter((c) => (c._id || c.id) !== userId));
    } catch (err) {
      console.error('Failed to unblock user:', err);
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] w-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] flex items-center gap-3 bg-[#128C7E] md:bg-white md:dark:bg-[#202C33]">
        <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-white/10 md:hover:bg-gray-100 md:dark:hover:bg-[#2A3942]">
          <ArrowLeft size={24} className="text-white md:text-gray-800 md:dark:text-[#E9EDEF]" />
        </Link>
        <h1 className="text-xl font-semibold text-white md:text-gray-900 md:dark:text-[#E9EDEF]">Blocked Contacts</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-[#128C7E]/30 border-t-[#128C7E] rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-20 h-20 rounded-full bg-[#128C7E]/10 flex items-center justify-center mb-4">
              <Shield size={40} className="text-[#128C7E]" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E9EDEF] mb-1">
              No blocked contacts
            </h2>
            <p className="text-sm text-gray-500 dark:text-[#8696A0]">
              Contacts you block will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#2A3942]">
            {contacts.map((contact) => {
              const uid = contact._id || contact.id;
              return (
                <div
                  key={uid}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2A3942]"
                >
                  <div className="w-12 h-12 rounded-full bg-[#128C7E]/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-semibold text-[#128C7E]">
                      {contact.name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-[#E9EDEF] truncate">
                      {contact.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-[#8696A0] truncate">
                      {contact.phone}
                    </p>
                  </div>
                  <button
                    onClick={() => handleUnblock(uid)}
                    disabled={unblockingId === uid}
                    className="text-sm font-medium text-red-500 hover:text-red-600 disabled:opacity-50 flex items-center gap-1 flex-shrink-0 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    {unblockingId === uid ? (
                      <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                    ) : (
                      <UserX size={16} />
                    )}
                    Unblock
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
