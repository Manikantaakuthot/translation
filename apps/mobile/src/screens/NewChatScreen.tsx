import React, { useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usersApi, conversationsApi } from '../api/client';
import { useChatStore } from '../store/chatStore';

type NavProp = NativeStackNavigationProp<any>;

interface UserResult {
  id: string;
  name: string;
  phone: string;
  profilePictureUrl?: string;
}

export default function NewChatScreen() {
  const navigation = useNavigation<NavProp>();
  const { loadConversations, selectConversation } = useChatStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await usersApi.search(q.trim());
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleStartChat = async (user: UserResult) => {
    setStarting(user.id);
    try {
      const { data } = await conversationsApi.create([user.id], 'direct');
      await loadConversations();
      selectConversation(data.id);
      // Navigate to chat — replace so back goes to conversations list
      navigation.replace('Chat', { conversationId: data.id });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not start chat');
    } finally {
      setStarting(null);
    }
  };

  const renderUser = ({ item }: { item: UserResult }) => {
    const initials = item.name.charAt(0).toUpperCase();
    const isStarting = starting === item.id;

    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleStartChat(item)}
        disabled={!!starting}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userPhone}>{item.phone}</Text>
        </View>
        {isStarting ? (
          <ActivityIndicator size="small" color="#075E54" />
        ) : (
          <Text style={styles.chatIcon}>💬</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone…"
          value={query}
          onChangeText={handleSearch}
          autoFocus
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {searching && <ActivityIndicator size="small" color="#075E54" style={{ marginLeft: 8 }} />}
      </View>

      {/* Hint */}
      {query.length < 2 && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Type a name or phone number to find someone</Text>
        </View>
      )}

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        ListEmptyComponent={
          query.length >= 2 && !searching ? (
            <View style={styles.hint}>
              <Text style={styles.hintText}>No users found for "{query}"</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
  },
  searchInput: {
    flex: 1, height: 44, backgroundColor: '#F5F5F5',
    borderRadius: 22, paddingHorizontal: 16, fontSize: 16,
  },
  hint: { padding: 24, alignItems: 'center' },
  hintText: { color: '#9E9E9E', fontSize: 14, textAlign: 'center' },
  userItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#075E54', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#303030' },
  userPhone: { fontSize: 13, color: '#9E9E9E', marginTop: 2 },
  chatIcon: { fontSize: 22 },
});
