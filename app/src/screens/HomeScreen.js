// ============================================================
//  Home Screen — Chat List + Online Status
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, RefreshControl, Animated, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as socketService from '../services/socket';

dayjs.extend(relativeTime);

const CHATS_STORAGE_KEY = '@hybrid_chats';

export default function HomeScreen({ navigation }) {
  const { theme } = useTheme();
  const { profile, signOut } = useAuth();
  const [chats, setChats] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const t = theme.colors;

  // Load persisted chats
  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [])
  );

  // Socket online/offline events
  useEffect(() => {
    const unsubOnline = socketService.on('user_online', ({ userId }) => {
      setOnlineUsers((prev) => new Set([...prev, userId]));
    });

    const unsubOffline = socketService.on('user_offline', ({ userId }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    const unsubList = socketService.on('online_users_list', (users) => {
      setOnlineUsers(new Set(users.map((u) => u.userId)));
    });

    // Incoming message → update chat list
    const unsubMsg = socketService.on('new_message', (data) => {
      updateChatWithMessage(data.from, data.senderName, data.message, data.originalTimestamp, false);
    });

    // Offline message delivered
    const unsubOfflineMsg = socketService.on('offline_message_delivered', (data) => {
      updateChatWithMessage(data.senderId, data.senderName, data.data, data.originalTimestamp, false);
    });

    // Message lost notification (Ultra-Private Ephemeral)
    const unsubLost = socketService.on('message_lost_notification', (data) => {
      // Update chat to show "delivery failed" state
      // Handled in ChatScreen too
      console.log('[HomeScreen] Message lost notification received');
    });

    return () => {
      unsubOnline();
      unsubOffline();
      unsubList();
      unsubMsg();
      unsubOfflineMsg();
      unsubLost();
    };
  }, []);

  async function loadChats() {
    try {
      const stored = await AsyncStorage.getItem(CHATS_STORAGE_KEY);
      if (stored) setChats(JSON.parse(stored));
    } catch (e) {
      console.error('[HomeScreen] Load chats error:', e.message);
    }
  }

  async function updateChatWithMessage(userId, userName, message, timestamp, isMine) {
    setChats((prev) => {
      const existing = prev.find((c) => c.userId === userId);
      const preview = message?.text || (message?.type === 'file' ? `📎 ${message.filename || 'File'}` : 'Message');

      let updated;
      if (existing) {
        updated = prev.map((c) =>
          c.userId === userId
            ? { ...c, lastMessage: preview, lastTimestamp: timestamp || new Date().toISOString(), unread: isMine ? c.unread : (c.unread || 0) + 1 }
            : c
        );
      } else {
        updated = [
          { userId, displayName: userName, lastMessage: preview, lastTimestamp: timestamp || new Date().toISOString(), unread: isMine ? 0 : 1 },
          ...prev,
        ];
      }

      // Sort by latest
      updated.sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));
      AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  // Export so ChatScreen can call it
  HomeScreen.updateChat = updateChatWithMessage;

  async function onRefresh() {
    setRefreshing(true);
    await loadChats();
    setRefreshing(false);
  }

  const filteredChats = searchText
    ? chats.filter((c) => c.displayName?.toLowerCase().includes(searchText.toLowerCase()))
    : chats;

  const s = makeStyles(theme);

  return (
    <View style={[s.container, { backgroundColor: t.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: t.headerBg, borderBottomColor: t.headerBorder }]}>
        <View style={s.headerLeft}>
          <View style={[s.avatar, { backgroundColor: t.primary }]}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={s.avatarImg} />
            ) : (
              <Text style={s.avatarText}>
                {(profile?.display_name || 'U')[0].toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            <Text style={[s.headerTitle, { color: t.text }]}>Hybrid Engine</Text>
            <Text style={[s.headerSub, { color: t.success }]}>
              {onlineUsers.size} online
            </Text>
          </View>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => navigation.navigate('Search')}
          >
            <Ionicons name="search-outline" size={22} color={t.text} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={signOut}>
            <Ionicons name="log-out-outline" size={22} color={t.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[s.searchWrap, { backgroundColor: t.surface }]}>
        <View style={[s.searchBar, { backgroundColor: t.inputBg }]}>
          <Ionicons name="search-outline" size={16} color={t.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={[s.searchInput, { color: t.inputText }]}
            placeholder="Search conversations..."
            placeholderTextColor={t.placeholder}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* Chat List */}
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => (
          <ChatItem
            item={item}
            isOnline={onlineUsers.has(item.userId)}
            theme={theme}
            onPress={() => {
              // Mark as read
              setChats((prev) =>
                prev.map((c) => c.userId === item.userId ? { ...c, unread: 0 } : c)
              );
              navigation.navigate('Chat', {
                targetUserId: item.userId,
                targetName: item.displayName,
                targetAvatar: item.avatar_url,
              });
            }}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.primary}
            colors={[t.primary]}
          />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="chatbubbles-outline" size={60} color={t.textMuted} />
            <Text style={[s.emptyText, { color: t.textMuted }]}>
              No conversations yet
            </Text>
            <Text style={[s.emptySubtext, { color: t.textMuted }]}>
              Search for users to start chatting
            </Text>
          </View>
        }
        contentContainerStyle={filteredChats.length === 0 && { flexGrow: 1 }}
      />
    </View>
  );
}

// ── Chat Item ──
function ChatItem({ item, isOnline, theme, onPress }) {
  const t = theme.colors;
  return (
    <TouchableOpacity
      style={[styles.chatItem, { borderBottomColor: t.divider }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrap}>
        <View style={[styles.chatAvatar, { backgroundColor: t.primary }]}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.chatAvatarImg} />
          ) : (
            <Text style={styles.chatAvatarText}>
              {(item.displayName || '?')[0].toUpperCase()}
            </Text>
          )}
        </View>
        {isOnline && <View style={[styles.onlineDot, { backgroundColor: t.online, borderColor: t.background }]} />}
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatTop}>
          <Text style={[styles.chatName, { color: t.text }]} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={[styles.chatTime, { color: t.textMuted }]}>
            {item.lastTimestamp ? dayjs(item.lastTimestamp).fromNow() : ''}
          </Text>
        </View>
        <View style={styles.chatBottom}>
          <Text style={[styles.chatPreview, { color: t.textSecondary }]} numberOfLines={1}>
            {item.lastMessage || 'Start a conversation...'}
          </Text>
          {item.unread > 0 && (
            <View style={[styles.badge, { backgroundColor: t.primary }]}>
              <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  avatarWrap: { position: 'relative', marginRight: 12 },
  chatAvatar: {
    width: 52, height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  chatAvatarImg: { width: 52, height: 52 },
  chatAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 14, height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  chatContent: { flex: 1 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  chatName: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  chatTime: { fontSize: 12 },
  chatBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatPreview: { fontSize: 13, flex: 1, marginRight: 8 },
  badge: {
    minWidth: 20, height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

function makeStyles(theme) {
  const t = theme.colors;
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 52,
      paddingBottom: 12,
      borderBottomWidth: 0.5,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    avatarImg: { width: 36, height: 36 },
    avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    headerTitle: { fontSize: 17, fontWeight: '700' },
    headerSub: { fontSize: 12 },
    headerRight: { flexDirection: 'row', gap: 4 },
    iconBtn: { padding: 8 },
    searchWrap: { paddingHorizontal: 16, paddingVertical: 8 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 14 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText: { fontSize: 16, fontWeight: '600', marginTop: 16 },
    emptySubtext: { fontSize: 13, marginTop: 8 },
  });
}
