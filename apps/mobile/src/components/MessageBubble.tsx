import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../store/chatStore';

interface Props {
  message: Message;
  isMine: boolean;
}

/** WhatsApp-style message status ticks */
function StatusTick({ message, isMine }: { message: Message; isMine: boolean }) {
  if (!isMine) return null;
  if (message.isDeleted) return null;

  const hasRead = message.status?.read && message.status.read.length > 0;
  const hasDelivered = message.status?.delivered && message.status.delivered.length > 0;

  if (hasRead) {
    // Blue double tick ✓✓
    return <Text style={styles.tickBlue}>✓✓</Text>;
  }
  if (hasDelivered) {
    // Grey double tick ✓✓
    return <Text style={styles.tickGrey}>✓✓</Text>;
  }
  // Single grey tick — sent but not yet delivered
  return <Text style={styles.tickGrey}>✓</Text>;
}

export default function MessageBubble({ message, isMine }: Props) {
  const bubbleStyle = isMine ? styles.bubbleMine : styles.bubbleOther;

  if (message.isDeleted) {
    return (
      <View style={[styles.bubble, bubbleStyle]}>
        <Text style={styles.deletedText}>🚫 This message was deleted</Text>
      </View>
    );
  }

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowOther]}>
      <View style={[styles.bubble, bubbleStyle]}>
        {/* Sender name (shown in group chats on others' messages) */}
        {!isMine && message.senderName && (
          <Text style={styles.senderName}>{message.senderName}</Text>
        )}

        {message.type === 'text' && (
          <Text style={styles.content}>{message.content}</Text>
        )}

        {message.type === 'image' && (
          <Text style={styles.mediaPlaceholder}>📷 Photo</Text>
        )}

        {(message.type === 'audio' || message.type === 'voice') && (
          <Text style={styles.mediaPlaceholder}>🎤 Voice message</Text>
        )}

        {message.type === 'video' && (
          <Text style={styles.mediaPlaceholder}>🎥 Video</Text>
        )}

        {message.type === 'document' && (
          <Text style={styles.mediaPlaceholder}>📄 Document</Text>
        )}

        <View style={styles.footer}>
          <Text style={styles.time}>{time}</Text>
          <StatusTick message={message} isMine={isMine} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 8,
  },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  bubbleMine: {
    backgroundColor: '#DCF8C6',
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#075E54',
    marginBottom: 2,
  },
  content: {
    fontSize: 15,
    color: '#303030',
    lineHeight: 20,
  },
  deletedText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
  },
  mediaPlaceholder: {
    fontSize: 14,
    color: '#555',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: '#9E9E9E',
  },
  tickGrey: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  tickBlue: {
    fontSize: 12,
    color: '#34B7F1',
  },
});
