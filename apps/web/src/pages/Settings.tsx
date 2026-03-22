import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Shield, Bell, Languages, Camera, Sun, Moon, Monitor,
  Download, Trash2, Eye, EyeOff, ChevronRight, LogOut, Ban,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { usersApi, mediaApi } from '../api/client';
import { useTranslationStore, LANGUAGE_OPTIONS } from '../store/translationStore';
import { useThemeStore } from '../store/themeStore';
import Modal from '../components/shared/Modal';

// Toggle switch component
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-[#128C7E]' : 'bg-gray-300 dark:bg-[#3B4A54]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function Settings() {
  const { user, setUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingLang, setSavingLang] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Privacy settings
  const [lastSeenPrivacy, setLastSeenPrivacy] = useState('contacts');
  const [profilePhotoPrivacy, setProfilePhotoPrivacy] = useState('contacts');
  const [aboutPrivacy, setAboutPrivacy] = useState('contacts');
  const [readReceipts, setReadReceipts] = useState(true);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // Notification settings
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [notifyCalls, setNotifyCalls] = useState(true);
  const [notifyGroups, setNotifyGroups] = useState(true);
  const [savingNotifications, setSavingNotifications] = useState(false);

  // Data export / account deletion
  const [exporting, setExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmPhone, setDeleteConfirmPhone] = useState('');
  const [deleting, setDeleting] = useState(false);

  const { theme, setTheme } = useThemeStore();

  const {
    preferredLanguage,
    autoTranslateMessages,
    autoTranslateCalls,
    setPreferredLanguage,
    setAutoTranslateMessages,
    setAutoTranslateCalls,
    saveLanguagePreferences,
  } = useTranslationStore();

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setStatusText(user.statusText || '');
      // Load privacy settings from user object if available
      if ((user as any).lastSeenPrivacy) setLastSeenPrivacy((user as any).lastSeenPrivacy);
      if ((user as any).profilePhotoPrivacy) setProfilePhotoPrivacy((user as any).profilePhotoPrivacy);
      if ((user as any).aboutPrivacy) setAboutPrivacy((user as any).aboutPrivacy);
      if ((user as any).readReceipts !== undefined) setReadReceipts((user as any).readReceipts);
      if ((user as any).notifyMessages !== undefined) setNotifyMessages((user as any).notifyMessages);
      if ((user as any).notifyCalls !== undefined) setNotifyCalls((user as any).notifyCalls);
      if ((user as any).notifyGroups !== undefined) setNotifyGroups((user as any).notifyGroups);
    }
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { data: uploadData } = await mediaApi.upload(file);
      const { data } = await usersApi.updateMe({ profilePictureUrl: uploadData.mediaUrl });
      setUser(data);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await usersApi.updateMe({ name, statusText });
      setUser(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLang(true);
    try {
      await saveLanguagePreferences();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingLang(false);
    }
  };

  const handleSavePrivacy = async () => {
    setSavingPrivacy(true);
    try {
      const { data } = await usersApi.updatePrivacy({
        lastSeenPrivacy,
        profilePhotoPrivacy,
        aboutPrivacy,
        readReceipts,
      });
      setUser(data);
    } catch (err) {
      console.error('Failed to save privacy settings:', err);
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSavingNotifications(true);
    try {
      const { data } = await usersApi.updateNotifications({
        notifyMessages,
        notifyCalls,
        notifyGroups,
      });
      setUser(data);
    } catch (err) {
      console.error('Failed to save notification settings:', err);
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const { data } = await usersApi.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `msg-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmPhone !== user?.phone) return;
    setDeleting(true);
    try {
      await usersApi.deleteAccount();
      logout();
      navigate('/login');
    } catch (err) {
      console.error('Account deletion failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const privacyOptions = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'contacts', label: 'My contacts' },
    { value: 'nobody', label: 'Nobody' },
  ];

  const themeOptions: { value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#111B21] w-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2A3942] flex items-center gap-3 bg-[#128C7E] md:bg-white md:dark:bg-[#202C33]">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-white/10 md:hover:bg-gray-100 md:dark:hover:bg-[#2A3942]">
          <ArrowLeft size={24} className="text-white md:text-gray-800 md:dark:text-[#E9EDEF]" />
        </Link>
        <h1 className="text-xl font-semibold text-white md:text-gray-900 md:dark:text-[#E9EDEF]">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        {/* ── Profile ── */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-[#8696A0] uppercase tracking-wider mb-4 flex items-center gap-2">
            <User size={18} />
            Profile
          </h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Avatar upload */}
            <div className="flex justify-center">
              <div className="relative">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <div className="w-24 h-24 rounded-full overflow-hidden bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] text-3xl font-bold">
                  {user?.profilePictureUrl ? (
                    <img src={user.profilePictureUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    user?.name?.[0]?.toUpperCase() || '?'
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#128C7E] text-white flex items-center justify-center shadow-md hover:bg-[#075E54] disabled:opacity-50"
                  title="Change profile picture"
                >
                  {uploadingAvatar ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Camera size={14} />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#E9EDEF] mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-[#2A3942] dark:bg-[#2A3942] dark:text-[#E9EDEF] focus:ring-2 focus:ring-[#128C7E] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#E9EDEF] mb-1">About</label>
              <input
                type="text"
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Hey there! I am using MQ"
                maxLength={139}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-[#2A3942] dark:bg-[#2A3942] dark:text-[#E9EDEF] dark:placeholder-[#8696A0] focus:ring-2 focus:ring-[#128C7E] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-[#8696A0] mt-1">{statusText.length}/139</p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#128C7E] text-white rounded-lg hover:bg-[#075E54] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        </section>

        {/* ── Appearance (Theme) ── */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-[#8696A0] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Sun size={18} />
            Appearance
          </h2>
          <div className="flex gap-2">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const isActive = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex-1 flex flex-col items-center gap-2 py-3 rounded-xl border-2 transition-all ${
                    isActive
                      ? 'border-[#128C7E] bg-[#128C7E]/10 dark:bg-[#128C7E]/20'
                      : 'border-gray-200 dark:border-[#2A3942] hover:border-gray-300 dark:hover:border-[#3B4A54]'
                  }`}
                >
                  <Icon size={22} className={isActive ? 'text-[#128C7E]' : 'text-gray-500 dark:text-[#8696A0]'} />
                  <span className={`text-sm font-medium ${isActive ? 'text-[#128C7E]' : 'text-gray-700 dark:text-[#E9EDEF]'}`}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Language & Translation ── */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-[#8696A0] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Languages size={18} />
            Language & Translation
          </h2>
          <form onSubmit={handleSaveLanguage} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#E9EDEF] mb-1">
                Preferred Language
              </label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-[#2A3942] dark:bg-[#2A3942] dark:text-[#E9EDEF] focus:ring-2 focus:ring-[#128C7E] focus:border-transparent"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-[#8696A0] mt-1">
                Messages and calls will be translated to this language
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">Auto-translate messages</p>
                  <p className="text-sm text-gray-500 dark:text-[#8696A0]">
                    Show translate option for incoming messages
                  </p>
                </div>
                <Toggle checked={autoTranslateMessages} onChange={setAutoTranslateMessages} />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">Real-time call translation</p>
                  <p className="text-sm text-gray-500 dark:text-[#8696A0]">
                    Enable voice translation during calls
                  </p>
                </div>
                <Toggle checked={autoTranslateCalls} onChange={setAutoTranslateCalls} />
              </label>
            </div>

            <button
              type="submit"
              disabled={savingLang}
              className="px-4 py-2 bg-[#128C7E] text-white rounded-lg hover:bg-[#075E54] disabled:opacity-50"
            >
              {savingLang ? 'Saving...' : 'Save Language Settings'}
            </button>
          </form>
        </section>

        {/* ── Privacy ── */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-[#8696A0] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Shield size={18} />
            Privacy
          </h2>
          <div className="space-y-4">
            {/* 2FA link */}
            <button
              onClick={() => navigate('/2fa')}
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-[#2A3942] hover:bg-gray-50 dark:hover:bg-[#2A3942] transition flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">Two-Factor Authentication</p>
                <p className="text-sm text-gray-500 dark:text-[#8696A0]">Add an extra layer of security</p>
              </div>
              <ChevronRight size={18} className="text-gray-400 dark:text-[#8696A0]" />
            </button>

            {/* Blocked contacts link */}
            <button
              onClick={() => navigate('/blocked-contacts')}
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-[#2A3942] hover:bg-gray-50 dark:hover:bg-[#2A3942] transition flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Ban size={18} className="text-gray-500 dark:text-[#8696A0]" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">Blocked contacts</p>
                  <p className="text-sm text-gray-500 dark:text-[#8696A0]">Manage blocked contacts</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-400 dark:text-[#8696A0]" />
            </button>

            {/* Privacy dropdowns */}
            <div className="space-y-3 pt-2">
              {[
                { label: 'Last seen', value: lastSeenPrivacy, setter: setLastSeenPrivacy, icon: Eye },
                { label: 'Profile photo', value: profilePhotoPrivacy, setter: setProfilePhotoPrivacy, icon: Camera },
                { label: 'About', value: aboutPrivacy, setter: setAboutPrivacy, icon: User },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <item.icon size={16} className="text-gray-500 dark:text-[#8696A0]" />
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">{item.label}</span>
                  </div>
                  <select
                    value={item.value}
                    onChange={(e) => item.setter(e.target.value)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A3942] dark:bg-[#2A3942] dark:text-[#E9EDEF] focus:ring-2 focus:ring-[#128C7E] focus:border-transparent"
                  >
                    {privacyOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}

              {/* Read receipts toggle */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  {readReceipts ? (
                    <Eye size={16} className="text-gray-500 dark:text-[#8696A0]" />
                  ) : (
                    <EyeOff size={16} className="text-gray-500 dark:text-[#8696A0]" />
                  )}
                  <div>
                    <span className="text-sm font-medium text-gray-800 dark:text-[#E9EDEF]">Read receipts</span>
                    <p className="text-xs text-gray-500 dark:text-[#8696A0]">Blue ticks when messages are read</p>
                  </div>
                </div>
                <Toggle checked={readReceipts} onChange={setReadReceipts} />
              </div>
            </div>

            <button
              onClick={handleSavePrivacy}
              disabled={savingPrivacy}
              className="px-4 py-2 bg-[#128C7E] text-white rounded-lg hover:bg-[#075E54] disabled:opacity-50"
            >
              {savingPrivacy ? 'Saving...' : 'Save Privacy Settings'}
            </button>
          </div>
        </section>

        {/* ── Notifications ── */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-[#8696A0] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Bell size={18} />
            Notifications
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">Message notifications</p>
                <p className="text-sm text-gray-500 dark:text-[#8696A0]">Show notifications for new messages</p>
              </div>
              <Toggle checked={notifyMessages} onChange={setNotifyMessages} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">Call notifications</p>
                <p className="text-sm text-gray-500 dark:text-[#8696A0]">Show notifications for incoming calls</p>
              </div>
              <Toggle checked={notifyCalls} onChange={setNotifyCalls} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">Group notifications</p>
                <p className="text-sm text-gray-500 dark:text-[#8696A0]">Show notifications for group messages</p>
              </div>
              <Toggle checked={notifyGroups} onChange={setNotifyGroups} />
            </div>
            <button
              onClick={handleSaveNotifications}
              disabled={savingNotifications}
              className="px-4 py-2 bg-[#128C7E] text-white rounded-lg hover:bg-[#075E54] disabled:opacity-50"
            >
              {savingNotifications ? 'Saving...' : 'Save Notification Settings'}
            </button>
          </div>
        </section>

        {/* ── Data & Storage ── */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-[#8696A0] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Download size={18} />
            Data & Storage
          </h2>
          <div className="space-y-3">
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-[#2A3942] hover:bg-gray-50 dark:hover:bg-[#2A3942] transition flex items-center gap-3 disabled:opacity-50"
            >
              <Download size={18} className="text-[#128C7E]" />
              <div>
                <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">
                  {exporting ? 'Exporting...' : 'Export my data'}
                </p>
                <p className="text-sm text-gray-500 dark:text-[#8696A0]">
                  Download all your messages and account data as JSON
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* ── Danger Zone ── */}
        <section className="pb-8">
          <h2 className="text-sm font-medium text-red-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Trash2 size={18} />
            Danger Zone
          </h2>
          <div className="space-y-3">
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-[#2A3942] hover:bg-gray-50 dark:hover:bg-[#2A3942] transition flex items-center gap-3"
            >
              <LogOut size={18} className="text-gray-500 dark:text-[#8696A0]" />
              <div>
                <p className="font-medium text-gray-900 dark:text-[#E9EDEF]">Log out</p>
                <p className="text-sm text-gray-500 dark:text-[#8696A0]">Sign out of your account</p>
              </div>
            </button>

            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full text-left px-4 py-3 rounded-lg border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition flex items-center gap-3"
            >
              <Trash2 size={18} className="text-red-500" />
              <div>
                <p className="font-medium text-red-600 dark:text-red-400">Delete my account</p>
                <p className="text-sm text-red-400 dark:text-red-500/70">
                  Permanently delete your account and all data
                </p>
              </div>
            </button>
          </div>
        </section>
      </div>

      {/* Delete Account Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeleteConfirmPhone(''); }}
        title="Delete Account"
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400 font-medium">
              This action is permanent and cannot be undone.
            </p>
            <p className="text-sm text-red-600 dark:text-red-500 mt-1">
              All your messages, contacts, groups, and account data will be permanently deleted.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#E9EDEF] mb-2">
              To confirm, enter your phone number: <strong className="text-gray-900 dark:text-white">{user?.phone}</strong>
            </label>
            <input
              type="text"
              value={deleteConfirmPhone}
              onChange={(e) => setDeleteConfirmPhone(e.target.value)}
              placeholder="Enter phone number"
              className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-[#2A3942] dark:bg-[#2A3942] dark:text-[#E9EDEF] focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowDeleteModal(false); setDeleteConfirmPhone(''); }}
              className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-[#2A3942] text-gray-700 dark:text-[#E9EDEF] hover:bg-gray-50 dark:hover:bg-[#2A3942]"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirmPhone !== user?.phone}
              className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
