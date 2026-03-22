import React, { useCallback, useEffect } from 'react';
import {
  View, FlatList, Text, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocket } from '../hooks/useSocket';

type NavProp = NativeStackNavigationProp<any>;

export default function ConversationsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user, accessToken } = useAuthStore();
  const {
    conversations, isLoading,
    loadConversations, addMessage, setTyping,
    updateMessageRead, updateMessageDelivered,
    updateParticipantOnline, selectConversation,
  } = useChatStore();

  const { socket, connected } = useSocket(accessToken);

  // ── Load conversations on mount ────────────────────────────────────────────
  useEffect(() => {
    loadConversations();
  }, []);

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg: any) => {
      if (!msg?.conversationId) return;
      addMessage(msg);
      // Emit delivery confirmation
      if (msg.id && msg.senderId !== user?.id) {
        socket.emit('message:delivered', {
          messageId: msg.id,
          conversationId: msg.conversationId,
        });
      }
    };

    const onConversationNew = () => loadConversations();

    const onUserOnline = ({ userId }: { userId: string }) =>
      updateParticipantOnline(userId, true);

    const onUserOffline = ({ userId }: { userId: string }) =>
      updateParticipantOnline(userId, false);

    const onTyping = ({ conversationId, userId }: any) => {
      setTyping(conversationId, userId, true);
      setTimeout(() => setTyping(conversationId, userId, false), 3000);
    };

    const onRead = ({ messageIds, userId, conversationId }: any) => {
      if (userId !== user?.id && messageIds?.length && conversationId) {
        updateMessageRead(conversationId, messageIds, userId);
      }
    };

    const onDelivered = ({ messageId, userId, conversationId }: any) => {
      if (messageId && userId && conversationId) {
        updateMessageDelivered(conversationId, messageId, userId);
      }
    };

    socket.on('message:receive', onMessage);
    socket.on('conversation:new', onConversationNew);
    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);
    socket.on('message:typing', onTyping);
    socket.on('message:read', onRead);
    socket.on('message:delivered', onDelivered);

    return () => {
      socket.off('message:receive', onMessage);
      socket.off('conversation:new', onConversationNew);
      socket.off('user:online', onUserOnline);
      socket.off('user:offline', onUserOffline);
      socket.off('message:typing', onTyping);
      socket.off('message:read', onRead);
      socket.off('message:delivered', onDelivered);
    };
  }, [socket, user?.id]);

  const handlePress = useCallback((convId: string) => {
    selectConversation(convId);
    navigation.navigate('Chat', { conversationId: convId });
  }, [navigation, selectConversation]);

  const renderItem = ({ item }: { item: any }) => {
    const other = item.participants?.find((p: any) => p.userId !== user?.id);
    const displayName = item.type === 'group' ? item.name : (other?.name || 'Unknown');
    const initials = (displayName || '?').charAt(0).toUpperCase();
    const isOnline = other?.isOnline ?? false;
    const unread = item.unreadCount ?? 0;

    const lastMsg = item.lastMessage;
    const preview = lastMsg
      ? lastMsg.type === 'text' ? (lastMsg.content?.slice(0, 60) || '')
        : lastMsg.type === 'image' ? '📷 Photo'
        : lastMsg.type === 'video' ? '🎥 Video'
        : lastMsg.type === 'voice' || lastMsg.type === 'audio' ? '🎤 Voice message'
        : '📎 Attachment'
      : 'Tap to chat';

    const time = lastMsg
      ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => handlePress(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.itemContent}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
            {!!time && (
              <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{time}</Text>
            )}
          </View>
          <View style={styles.bottomRow}>
            <Text style={[styles.preview, unread > 0 && styles.previewBold]} numberOfLines={1}>
              {preview}
            </Text>
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Connection status banner */}
      {!connected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Connecting…</Text>
        </View>
      )}

      {isLoading && conversations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#075E54" />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptySubtitle}>Tap the pencil icon to start a new chat</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={loadConversations}
              tintColor="#075E54"
            />
          }
        />
      )}

      {/* New chat FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewChat')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>✏️</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  offlineBanner: {
    backgroundColor: '#FFC107', paddingVertical: 4,
    alignItems: 'center',
  },
  offlineText: { fontSize: 12, color: '#333', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#303030' },
  emptySubtitle: { fontSize: 14, color: '#9E9E9E', textAlign: 'center', marginTop: 8 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
  },
  avatarWrap: { position: 'relative', marginRight: 12 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#075E54', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#25D366', borderWidth: 2, borderColor: '#fff',
  },
  itemContent: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  name: { fontSize: 16, fontWeight: '600', color: '#303030', flex: 1, marginRight: 8 },
  time: { fontSize: 12, color: '#9E9E9E' },
  timeUnread: { color: '#25D366', fontWeight: '600' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preview: { fontSize: 13, color: '#9E9E9E', flex: 1, marginRight: 8 },
  previewBold: { color: '#303030', fontWeight: '500' },
  badge: {
    backgroundColor: '#25D366', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  fabIcon: { fontSize: 22 },
});
