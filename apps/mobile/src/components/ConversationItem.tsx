import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Conversation } from '../store/chatStore';

interface Props {
  conversation: Conversation;
  currentUserId: string;
  onPress: () => void;
}

export default function ConversationItem({ conversation, currentUserId, onPress }: Props) {
  // For direct chats, display the other participant's name
  const other = conversation.participants.find((p) => p.userId !== currentUserId);
  const displayName = conversation.type === 'group' ? conversation.name : (other?.name || 'Unknown');
  const initials = (displayName || '?').charAt(0).toUpperCase();

  const lastMsg = conversation.lastMessage;
  const preview = lastMsg
    ? lastMsg.type === 'text'
      ? lastMsg.content?.slice(0, 60) || ''
      : lastMsg.type === 'image' ? '📷 Photo'
      : lastMsg.type === 'video' ? '🎥 Video'
      : lastMsg.type === 'voice' || lastMsg.type === 'audio' ? '🎤 Voice message'
      : '📎 Attachment'
    : 'Tap to chat';

  const time = lastMsg
    ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const isOnline = other?.isOnline ?? false;
  const unread = conversation.unreadCount ?? 0;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar */}
      <View style={styles.avatarWrapper}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        {isOnline && <View style={styles.onlineDot} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {time ? <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{time}</Text> : null}
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
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#25D366',
    borderWidth: 2,
    borderColor: '#fff',
  },
  content: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: { fontSize: 16, fontWeight: '600', color: '#303030', flex: 1, marginRight: 8 },
  time: { fontSize: 12, color: '#9E9E9E' },
  timeUnread: { color: '#25D366', fontWeight: '600' },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preview: { fontSize: 13, color: '#9E9E9E', flex: 1, marginRight: 8 },
  previewBold: { color: '#303030', fontWeight: '500' },
  badge: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
