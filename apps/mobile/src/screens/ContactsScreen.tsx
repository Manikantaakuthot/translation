import React, { useEffect } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
const SMS = Platform.OS !== 'web' ? require('expo-sms') : null;
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { conversationsApi } from '../api/client';
import { useContacts, AppContact, DeviceContact } from '../hooks/useContacts';

type NavProp = NativeStackNavigationProp<any>;

const INVITE_MSG = 'Hey! I use MSG to chat. Join me: https://msg.app/join';

interface Section {
  title: string;
  data: any[];
  type: 'onApp' | 'invite' | 'unknown';
}

export default function ContactsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const { conversations, loadConversations, selectConversation } = useChatStore();
  const { onApp, notOnApp, loading, permissionDenied, sync } = useContacts();

  useEffect(() => {
    sync();
    loadConversations();
  }, []);

  // Derive "unknown senders" — direct conversation participants not in our contact list
  const onAppIds = new Set(onApp.map((c) => c.id));
  const unknownSenders = conversations
    .filter((conv) => conv.type === 'direct')
    .flatMap((conv) =>
      conv.participants
        .filter((p) => p.userId !== user?.id && !onAppIds.has(p.userId))
        .map((p) => ({ ...p, convId: conv.id })),
    )
    // Deduplicate by userId
    .filter((p, i, arr) => arr.findIndex((x) => x.userId === p.userId) === i);

  const sections: Section[] = [
    {
      title: `On MSG  (${onApp.length})`,
      data: onApp.length > 0 ? onApp : [{ __empty: 'No contacts on MSG yet' }],
      type: 'onApp',
    },
    {
      title: `Invite  (${notOnApp.length})`,
      data: notOnApp.length > 0 ? notOnApp : [{ __empty: 'All your contacts are already on MSG!' }],
      type: 'invite',
    },
    ...(unknownSenders.length > 0
      ? [
          {
            title: `Unknown Senders  (${unknownSenders.length})`,
            data: unknownSenders,
            type: 'unknown' as const,
          },
        ]
      : []),
  ];

  const handleOpenChat = async (userId: string) => {
    try {
      const { data } = await conversationsApi.create([userId], 'direct');
      await loadConversations();
      selectConversation(data.id);
      navigation.navigate('Chat', { conversationId: data.id });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not open chat');
    }
  };

  const handleInvite = async (contact: DeviceContact) => {
    if (Platform.OS === 'web') {
      const nav = navigator as any;
      if (nav.share) {
        nav.share({ text: INVITE_MSG }).catch(() => {});
      } else {
        Alert.alert('Invite', INVITE_MSG);
      }
      return;
    }
    const available = await SMS.isAvailableAsync();
    if (!available) {
      Alert.alert('SMS unavailable', 'Cannot send SMS from this device.');
      return;
    }
    await SMS.sendSMSAsync([contact.phone], INVITE_MSG);
  };

  const renderOnApp = (item: AppContact) => {
    if ((item as any).__empty) return <EmptyRow text={(item as any).__empty} />;
    const initials = item.name.charAt(0).toUpperCase();
    return (
      <TouchableOpacity style={styles.row} onPress={() => handleOpenChat(item.id)} activeOpacity={0.7}>
        <View style={[styles.avatar, { backgroundColor: '#075E54' }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.sub}>{item.phone}</Text>
        </View>
        <Text style={styles.actionIcon}>💬</Text>
      </TouchableOpacity>
    );
  };

  const renderInvite = (item: DeviceContact) => {
    if ((item as any).__empty) return <EmptyRow text={(item as any).__empty} />;
    const initials = item.name.charAt(0).toUpperCase();
    return (
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: '#9E9E9E' }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.sub}>{item.phone}</Text>
        </View>
        <TouchableOpacity style={styles.inviteBtn} onPress={() => handleInvite(item)}>
          <Text style={styles.inviteBtnText}>Invite</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderUnknown = (item: { userId: string; name?: string; convId: string }) => {
    const initials = (item.name || '?').charAt(0).toUpperCase();
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          selectConversation(item.convId);
          navigation.navigate('Chat', { conversationId: item.convId });
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: '#FF6D00' }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name || 'Unknown'}</Text>
          <Text style={styles.sub}>Sent you a message</Text>
        </View>
        <Text style={styles.actionIcon}>💬</Text>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item, section }: { item: any; section: Section }) => {
    if (section.type === 'onApp') return renderOnApp(item);
    if (section.type === 'invite') return renderInvite(item);
    return renderUnknown(item);
  };

  if (permissionDenied) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>Contacts permission needed</Text>
        <Text style={styles.permissionSub}>
          Allow MSG to access your contacts to see which friends are already on the app.
        </Text>
        <TouchableOpacity style={styles.allowBtn} onPress={sync}>
          <Text style={styles.allowBtnText}>Allow Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.allowBtn, { backgroundColor: '#E0E0E0', marginTop: 8 }]}
          onPress={() => navigation.navigate('NewChat')}
        >
          <Text style={[styles.allowBtnText, { color: '#303030' }]}>Search manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#075E54" />
          <Text style={styles.loadingText}>Syncing contacts…</Text>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => item.id || item.userId || String(i)}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <View style={styles.emptyRow}>
      <Text style={styles.emptyRowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#F5F5F5', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
  },
  loadingText: { marginLeft: 8, fontSize: 13, color: '#757575' },
  sectionHeader: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16, paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#075E54', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#303030' },
  sub: { fontSize: 13, color: '#9E9E9E', marginTop: 2 },
  actionIcon: { fontSize: 22, marginLeft: 8 },
  inviteBtn: {
    backgroundColor: '#25D366', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 16, marginLeft: 8,
  },
  inviteBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyRow: { padding: 16 },
  emptyRowText: { color: '#9E9E9E', fontSize: 14, textAlign: 'center' },
  permissionTitle: { fontSize: 18, fontWeight: '700', color: '#303030', marginBottom: 8, textAlign: 'center' },
  permissionSub: { fontSize: 14, color: '#757575', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  allowBtn: {
    backgroundColor: '#075E54', paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 24, width: '100%', alignItems: 'center',
  },
  allowBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
