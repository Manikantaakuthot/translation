import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Text, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocket } from '../hooks/useSocket';
import MessageBubble from '../components/MessageBubble';

type ChatRouteParams = { conversationId: string };

export default function ChatScreen() {
  const route = useRoute<RouteProp<Record<string, ChatRouteParams>, string>>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { conversationId } = route.params;

  const { user, accessToken } = useAuthStore();
  const {
    conversations, messages, isLoading,
    loadMessages, sendMessage, markMessagesRead,
    updateMessageRead, updateMessageDelivered,
    addMessage, setTyping, typingUsers, deleteMessage,
  } = useChatStore();

  const { socket } = useSocket(accessToken);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conversationMessages = messages[conversationId] || [];
  const conversation = conversations.find((c) => c.id === conversationId);
  const typingInConv = typingUsers[conversationId] || [];
  const otherParticipant = conversation?.participants?.find((p) => p.userId !== user?.id);
  const headerTitle = conversation?.type === 'group'
    ? conversation.name || 'Group'
    : otherParticipant?.name || 'Chat';

  // ── Set header title ───────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      title: headerTitle,
      headerRight: () =>
        otherParticipant?.isOnline ? (
          <Text style={styles.onlineLabel}>online</Text>
        ) : null,
    });
  }, [headerTitle, otherParticipant?.isOnline]);

  // ── Load message history on mount ──────────────────────────────────────────
  useEffect(() => {
    loadMessages(conversationId);
  }, [conversationId]);

  // ── Auto-scroll to bottom when messages change ─────────────────────────────
  useEffect(() => {
    if (conversationMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [conversationMessages.length]);

  // ── Mark visible messages as read ─────────────────────────────────────────
  useEffect(() => {
    const unreadIds = conversationMessages
      .filter((m) => m.senderId !== user?.id && !(m.status?.read?.length))
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      markMessagesRead(conversationId, unreadIds);
    }
  }, [conversationMessages.length, conversationId, user?.id]);

  // ── Socket listeners scoped to this chat ──────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg: any) => {
      if (msg?.conversationId !== conversationId) return;
      addMessage(msg);
      // Deliver + read immediately since user is viewing
      if (msg.id && msg.senderId !== user?.id) {
        socket.emit('message:delivered', { messageId: msg.id, conversationId });
        markMessagesRead(conversationId, [msg.id]);
      }
    };

    const onTyping = ({ conversationId: cid, userId }: any) => {
      if (cid !== conversationId) return;
      setTyping(cid, userId, true);
      setTimeout(() => setTyping(cid, userId, false), 3000);
    };

    const onRead = ({ messageIds, userId, conversationId: cid }: any) => {
      if (cid === conversationId && userId !== user?.id && messageIds?.length) {
        updateMessageRead(conversationId, messageIds, userId);
      }
    };

    const onDelivered = ({ messageId, userId, conversationId: cid }: any) => {
      if (cid === conversationId && messageId && userId) {
        updateMessageDelivered(conversationId, messageId, userId);
      }
    };

    const onDelete = ({ messageId, conversationId: cid }: any) => {
      if (cid === conversationId && messageId) {
        deleteMessage(messageId, conversationId);
      }
    };

    socket.on('message:receive', onMessage);
    socket.on('message:typing', onTyping);
    socket.on('message:read', onRead);
    socket.on('message:delivered', onDelivered);
    socket.on('message:delete', onDelete);

    return () => {
      socket.off('message:receive', onMessage);
      socket.off('message:typing', onTyping);
      socket.off('message:read', onRead);
      socket.off('message:delivered', onDelivered);
      socket.off('message:delete', onDelete);
    };
  }, [socket, conversationId, user?.id]);

  // ── Typing indicator emission ──────────────────────────────────────────────
  const handleTextChange = useCallback((value: string) => {
    setText(value);
    if (!socket) return;
    socket.emit('message:typing', { conversationId });
    // Throttle by clearing/re-setting a timer
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {}, 3000);
  }, [socket, conversationId]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setText('');
    setSending(true);
    try {
      await sendMessage(conversationId, trimmed);
    } finally {
      setSending(false);
    }
  }, [text, sending, conversationId, sendMessage]);

  const renderMessage = useCallback(({ item }: any) => (
    <MessageBubble message={item} isMine={item.senderId === user?.id} />
  ), [user?.id]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Message list */}
      {isLoading && conversationMessages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#075E54" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={conversationMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No messages yet. Say hi! 👋</Text>
            </View>
          }
        />
      )}

      {/* Typing indicator */}
      {typingInConv.length > 0 && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>typing…</Text>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          value={text}
          onChangeText={handleTextChange}
          multiline
          maxLength={4096}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendIcon}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECE5DD' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  listContent: { paddingVertical: 8 },
  emptyText: { color: '#9E9E9E', fontSize: 14 },
  typingRow: {
    paddingHorizontal: 16, paddingBottom: 4,
  },
  typingText: { fontSize: 12, color: '#555', fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD',
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    fontSize: 16, marginRight: 8,
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#A5D6A7' },
  sendIcon: { color: '#fff', fontSize: 18 },
  onlineLabel: { fontSize: 13, color: '#25D366', marginRight: 16 },
});
