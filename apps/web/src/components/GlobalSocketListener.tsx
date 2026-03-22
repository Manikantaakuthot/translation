import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocket } from '../hooks/useSocket';
import { playMessageReceived, playNotification } from '../utils/sounds';

/**
 * GlobalSocketListener: Handles socket events for messages globally
 * This component should be mounted at the app level so messages are received
 * regardless of which page the user is viewing.
 */
export default function GlobalSocketListener() {
  const { user, accessToken } = useAuthStore();
  const typingTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const {
    selectedConversationId,
    addMessage,
    setTyping,
    markMessagesRead,
    updateMessageRead,
    deleteMessage,
    updateMessageDelivered,
    updateParticipantOnline,
    loadConversations,
    updateMessage,
  } = useChatStore();
  const { socket, connected } = useSocket(accessToken);

  // Message event listeners
  useEffect(() => {
    if (!socket) {
      console.log('[GlobalSocket] No socket available — message listeners not registered');
      return;
    }

    console.log('[GlobalSocket] Registering message event listeners, socket connected:', socket.connected);

    const onMessage = (msg: any) => {
      console.log('[GlobalSocket] Received message:receive', msg?.id, 'convId:', msg?.conversationId, 'from:', msg?.senderId);
      if (!msg || !msg.conversationId) {
        console.error('[GlobalSocket] Received invalid message:', msg);
        return;
      }
      addMessage(msg);

      // Emit delivery confirmation back to server (so sender sees double tick)
      if (msg.id && msg.senderId !== user?.id) {
        socket.emit('message:delivered', {
          messageId: msg.id,
          conversationId: msg.conversationId,
        });
      }

      // Auto-mark as read if currently viewing this conversation
      if (msg.conversationId === selectedConversationId && msg.senderId !== user?.id) {
        markMessagesRead(msg.conversationId, [msg.id]);
      } else if (msg.senderId !== user?.id) {
        // Play notification sound for messages in other conversations
        // Check if conversation is muted before playing sound
        const convs = useChatStore.getState().conversations;
        const conv = convs.find((c) => c.id === msg.conversationId);
        if (!conv?.isMuted) {
          playMessageReceived();
        }
      }

      // Update document title with unread count
      const totalUnread = useChatStore.getState().conversations
        .reduce((sum, c) => sum + (c.unreadCount ?? 0), 0) + 1;
      document.title = totalUnread > 0 ? `(${totalUnread}) MQ` : 'MQ';

      // Refresh conversations to update the sidebar with latest message
      loadConversations();
    };

    const onTyping = (data: { conversationId: string; userId: string }) => {
      const key = `${data.conversationId}:${data.userId}`;
      setTyping(data.conversationId, data.userId, true);
      const existing = typingTimeoutsRef.current.get(key);
      if (existing) clearTimeout(existing);
      const timeout = setTimeout(() => {
        setTyping(data.conversationId, data.userId, false);
        typingTimeoutsRef.current.delete(key);
      }, 3000);
      typingTimeoutsRef.current.set(key, timeout);
    };

    const onRead = (data: { messageIds: string[]; userId: string; conversationId?: string }) => {
      if (data.userId !== user?.id && data.messageIds?.length) {
        const convId = data.conversationId || selectedConversationId || '';
        if (convId) {
          updateMessageRead(convId, data.messageIds, data.userId);
        }
      }
    };

    const onDelete = (data: { messageId: string; conversationId?: string }) => {
      const convId = data.conversationId || selectedConversationId;
      if (data.messageId && convId) {
        deleteMessage(data.messageId, convId);
      }
    };

    const onDelivered = (data: { messageId: string; userId: string; conversationId?: string }) => {
      const convId = data.conversationId || selectedConversationId;
      if (data.messageId && data.userId && convId) {
        updateMessageDelivered(convId, data.messageId, data.userId);
      }
    };

    const onEdited = (data: any) => {
      if (data?.id && data?.conversationId) {
        updateMessage(data.conversationId, data.id, {
          content: data.content,
          isEdited: true,
          editedAt: data.editedAt || new Date().toISOString(),
        });
      }
    };

    // When a new conversation is created involving this user, refresh sidebar
    const onConversationNew = (data: { conversationId: string }) => {
      console.log('[GlobalSocket] New conversation:', data.conversationId);
      loadConversations();
    };

    // Poll vote handler
    const onPollVote = (data: { messageId: string; poll: any; conversationId: string }) => {
      if (data.messageId && data.conversationId) {
        updateMessage(data.conversationId, data.messageId, { poll: data.poll });
      }
    };

    socket.on('message:receive', onMessage);
    socket.on('message:typing', onTyping);
    socket.on('message:read', onRead);
    socket.on('message:delete', onDelete);
    socket.on('message:delivered', onDelivered);
    socket.on('message:edited', onEdited);
    socket.on('conversation:new', onConversationNew);
    socket.on('poll:vote', onPollVote);

    return () => {
      socket.off('message:receive', onMessage);
      socket.off('message:typing', onTyping);
      socket.off('message:read', onRead);
      socket.off('message:delete', onDelete);
      socket.off('message:delivered', onDelivered);
      socket.off('message:edited', onEdited);
      socket.off('conversation:new', onConversationNew);
      socket.off('poll:vote', onPollVote);
    };
  }, [socket, selectedConversationId, user?.id]);

  // User online/offline event listeners
  useEffect(() => {
    if (!socket) return;

    const onUserOnline = (data: { userId: string }) => {
      updateParticipantOnline(data.userId, true);
    };

    const onUserOffline = (data: { userId: string }) => {
      updateParticipantOnline(data.userId, false);
    };

    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);

    return () => {
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
    };
  }, [socket, updateParticipantOnline]);

  // Group event listeners
  useEffect(() => {
    if (!socket) return;

    const onGroupUpdated = () => {
      loadConversations();
    };

    const onGroupMemberAdded = () => {
      loadConversations();
    };

    const onGroupMemberRemoved = () => {
      loadConversations();
    };

    socket.on('group:updated', onGroupUpdated);
    socket.on('group:member_added', onGroupMemberAdded);
    socket.on('group:member_removed', onGroupMemberRemoved);

    return () => {
      socket.off('group:updated', onGroupUpdated);
      socket.off('group:member_added', onGroupMemberAdded);
      socket.off('group:member_removed', onGroupMemberRemoved);
    };
  }, [socket, loadConversations]);

  // Track connection status in store + reload on connect
  useEffect(() => {
    const { setSocketConnected } = useChatStore.getState();
    setSocketConnected(connected);
    if (connected && user?.id) {
      console.log('[GlobalSocket] Socket connected for user:', user.id, user.name);
      // Load conversations on connect to ensure we have the latest data
      loadConversations();
    } else if (!connected) {
      console.log('[GlobalSocket] Socket disconnected');
    }
  }, [connected, user?.id]);

  // Periodic conversation polling (safety net for missed socket events)
  useEffect(() => {
    if (!connected || !user?.id) return;

    const interval = setInterval(() => {
      loadConversations();
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [connected, user?.id, loadConversations]);

  // Log when socket receives authenticated event
  useEffect(() => {
    if (!socket) return;

    const onAuthenticated = (data: any) => {
      console.log('[GlobalSocket] Authenticated:', data);
    };

    socket.on('authenticated', onAuthenticated);
    return () => {
      socket.off('authenticated', onAuthenticated);
    };
  }, [socket]);

  // Sync data when tab becomes visible (user returns from background)
  useEffect(() => {
    if (!connected || !user?.id) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[GlobalSocket] Tab became visible, syncing data');
        loadConversations();
        const currentConvId = useChatStore.getState().selectedConversationId;
        if (currentConvId) {
          useChatStore.getState().loadMessages(currentConvId);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connected, user?.id, loadConversations]);

  // Status real-time events — trigger feed refresh on Status page
  useEffect(() => {
    if (!socket) return;

    const onStatusCreated = () => {
      window.dispatchEvent(new Event('status:refresh'));
    };
    const onStatusDeleted = () => {
      window.dispatchEvent(new Event('status:refresh'));
    };

    socket.on('status:created', onStatusCreated);
    socket.on('status:deleted', onStatusDeleted);
    return () => {
      socket.off('status:created', onStatusCreated);
      socket.off('status:deleted', onStatusDeleted);
    };
  }, [socket]);

  return null; // This component doesn't render anything
}
