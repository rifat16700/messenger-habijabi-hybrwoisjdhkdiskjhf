// SearchScreen.js — User Search
import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { searchUsers } from '../services/supabase';
import { SvgXml } from 'react-native-svg';

export default function SearchScreen({ navigation }) {
  const { theme } = useTheme();
  const t = theme.colors;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(text) {
    setQuery(text);
    if (text.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const { data } = await searchUsers(text.trim());
    setResults(data || []);
    setLoading(false);
  }

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.headerBorder }]}>
        <Text style={[styles.title, { color: t.text }]}>Find People</Text>
      </View>
      <View style={[styles.searchBar, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
        <Ionicons name="search-outline" size={18} color={t.textMuted} />
        <TextInput
          style={[styles.input, { color: t.inputText }]}
          placeholder="Search by name or @username"
          placeholderTextColor={t.placeholder}
          value={query}
          onChangeText={handleSearch}
          autoFocus
        />
        {loading && <ActivityIndicator size="small" color={t.primary} />}
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.userItem, { borderBottomColor: t.divider }]}
            onPress={() => navigation.navigate('Chat', { targetUserId: item.id, targetName: item.display_name, targetAvatar: item.avatar_url })}
          >
            <View style={[styles.avatar, { backgroundColor: t.primary }]}>
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                : <Text style={styles.avatarText}>{(item.display_name || '?')[0].toUpperCase()}</Text>}
            </View>
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: t.text }]}>{item.display_name}</Text>
                {item.badges?.svg_code && (
                  <SvgXml xml={item.badges.svg_code} width={16} height={16} style={{ marginLeft: 4 }} />
                )}
              </View>
              <Text style={[styles.username, { color: t.textSecondary }]}>@{item.username}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          query.length >= 2 && !loading
            ? <Text style={[styles.empty, { color: t.textMuted }]}>No users found</Text>
            : query.length > 0
            ? <Text style={[styles.empty, { color: t.textMuted }]}>Type at least 2 characters</Text>
            : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 0.5 },
  title: { fontSize: 24, fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 16, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  input: { flex: 1, fontSize: 15 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: 48, height: 48 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  username: { fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
