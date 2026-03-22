import React, { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { storage } from './src/utils/storage';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { useChatStore } from './src/store/chatStore';
import { registerForPushNotifications, usePushNotifications } from './src/hooks/usePushNotifications';
import { useContacts } from './src/hooks/useContacts';

export default function App() {
  const { hydrate, user } = useAuthStore();
  const { syncMissedMessages, selectConversation, loadConversations } = useChatStore();
  const { sync: syncContacts } = useContacts();

  // ── 1. Hydrate auth state from secure storage on first launch ──────────────
  useEffect(() => {
    hydrate();
  }, []);

  // ── 2. Register for push notifications + initial contact sync once logged in ─
  useEffect(() => {
    if (!user) return;
    registerForPushNotifications().catch((err) =>
      console.warn('[App] Push registration failed:', err),
    );
    syncContacts().catch(() => {});
  }, [user?.id]);

  // ── 3. Sync missed messages when app comes to foreground ───────────────────
  useEffect(() => {
    if (!user) return;

    const syncOnForeground = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      try {
        const lastOnline = await storage.getItem('lastOnline');
        if (lastOnline) {
          await syncMissedMessages(lastOnline);
        } else {
          // First open — just load conversations
          await loadConversations();
        }
        // Update lastOnline timestamp
        await storage.setItem('lastOnline', new Date().toISOString());
      } catch (err) {
        console.warn('[App] Missed message sync failed:', err);
      }
    };

    // Run immediately when this effect fires (app just opened / user logged in)
    syncOnForeground('active');

    // Save lastOnline when app goes to background/inactive
    const handleStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        await storage.setItem('lastOnline', new Date().toISOString());
      } else if (nextState === 'active') {
        await syncOnForeground(nextState);
        syncContacts().catch(() => {}); // silent refresh
      }
    };

    const subscription = AppState.addEventListener('change', handleStateChange);
    return () => subscription.remove();
  }, [user?.id]);

  // ── 4. Handle push notification taps (navigate to the right chat) ─────────
  usePushNotifications({
    onNotificationTap: (data) => {
      const convId = data?.conversationId;
      if (convId) {
        // The navigation ref is inside NavigationContainer, so we dispatch
        // via the store — the ConversationsScreen/AppNavigator will observe this
        selectConversation(convId);
        // Navigation happens in AppNavigator watching selectedConversationId
      }
    },
  });

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}
