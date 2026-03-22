import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import Login from './pages/Login';
import LoginOTP from './pages/LoginOTP';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import TwoFactorAuth from './pages/TwoFactorAuth';
import Chats from './pages/Chats';
import NewChat from './pages/NewChat';
import NewGroup from './pages/NewGroup';
import Contacts from './pages/Contacts';
import Settings from './pages/Settings';
import ChatWindow from './components/chat/ChatWindow';
import Status from './pages/Status';
import StatusNew from './pages/StatusNew';
import Calls from './pages/Calls';
import StarredMessages from './pages/StarredMessages';
import BlockedContacts from './pages/BlockedContacts';
import JoinGroup from './pages/JoinGroup';
import Channels from './pages/Channels';
import ChannelView from './pages/ChannelView';
import LinkedDevices from './pages/LinkedDevices';
import IncomingCall from './components/call/IncomingCall';
import CallScreen from './components/call/CallScreen';
import CallListener from './components/call/CallListener';
import GlobalSocketListener from './components/GlobalSocketListener';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[#111B21] p-4">
            <div className="bg-white dark:bg-[#202C33] rounded-lg shadow p-6 max-w-md text-center">
              <h1 className="text-xl font-semibold text-red-600 mb-2">Something went wrong</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{this.state.error?.message}</p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="px-4 py-2 bg-[#128C7E] text-white rounded-lg"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, user, loadUser } = useAuthStore();

  useEffect(() => {
    // Only fetch user when we have token but no user (e.g. page refresh)
    if (accessToken && !user) {
      loadUser();
    }
  }, [accessToken, user]);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/** Renders global overlays and listeners only when the user is authenticated */
function GlobalOverlays() {
  const { accessToken } = useAuthStore();
  if (!accessToken) return null;
  return (
    <>
      <GlobalSocketListener />
      <CallListener />
      <IncomingCall />
      <CallScreen />
    </>
  );
}

function App() {
  const { _hasHydrated, setHasHydrated } = useAuthStore();
  const { isDark, theme } = useThemeStore();

  // Apply dark class to document root based on theme
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      if (isDark()) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };
    applyTheme();
    // Listen for system theme changes when using 'system' mode
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyTheme);
      return () => mq.removeEventListener('change', applyTheme);
    }
  }, [theme, isDark]);

  // Fallback: some environments may not fire onRehydrateStorage (e.g. empty storage)
  useEffect(() => {
    if (_hasHydrated) return;
    const t = setTimeout(() => setHasHydrated(true), 100);
    return () => clearTimeout(t);
  }, [_hasHydrated, setHasHydrated]);

  // Wait for Zustand persist to rehydrate before rendering auth-dependent routes
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#128C7E]">
        <div className="text-white text-center">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p>Loading MQ...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <GlobalOverlays />
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login-otp" element={<LoginOTP />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Chats />
            </ProtectedRoute>
          }
        >
          <Route index element={<ChatWindow />} />
          <Route path="new-chat" element={<NewChat />} />
          <Route path="new-group" element={<NewGroup />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="2fa" element={<TwoFactorAuth />} />
          <Route path="chat/:id" element={<ChatWindow />} />
          <Route path="status" element={<Status />} />
          <Route path="status/new" element={<StatusNew />} />
          <Route path="calls" element={<Calls />} />
          <Route path="starred" element={<StarredMessages />} />
          <Route path="blocked-contacts" element={<BlockedContacts />} />
          <Route path="channels" element={<Channels />} />
          <Route path="channel/:id" element={<ChannelView />} />
          <Route path="linked-devices" element={<LinkedDevices />} />
        </Route>
        <Route path="/join/:inviteCode" element={<JoinGroup />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
