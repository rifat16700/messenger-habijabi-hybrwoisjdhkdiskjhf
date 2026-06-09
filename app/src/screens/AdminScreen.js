// AdminScreen.js — Admin Panel (Web Dashboard & In-App)
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { getAllUsers, banUser, changeUserRole, assignBadge, getAllBadges, createBadge, deleteBadge } from '../services/supabase';

export default function AdminScreen() {
  const { theme } = useTheme();
  const t = theme.colors;

  const [tab, setTab] = useState('users'); // 'users' | 'badges'
  const [users, setUsers] = useState([]);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Badge creation modal
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [newBadge, setNewBadge] = useState({ id: '', name: '', description: '', svgCode: '', color: '#6366F1' });

  useEffect(() => {
    if (tab === 'users') loadUsers();
    else loadBadges();
  }, [tab, page]);

  async function loadUsers() {
    setLoading(true);
    const { data, count } = await getAllUsers({ page, pageSize: 20 });
    setUsers(data || []);
    setTotalUsers(count || 0);
    setLoading(false);
  }

  async function loadBadges() {
    setLoading(true);
    const { data } = await getAllBadges();
    setBadges(data || []);
    setLoading(false);
  }

  async function handleBanUser(userId, isBanned) {
    Alert.alert(
      isBanned ? 'Unban User' : 'Ban User',
      `Are you sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBanned ? 'Unban' : 'Ban',
          style: 'destructive',
          onPress: async () => {
            await banUser(userId, !isBanned);
            loadUsers();
          },
        },
      ]
    );
  }

  async function handleRoleChange(userId, currentRole) {
    const roles = ['user', 'moderator', 'admin'];
    const nextRole = roles[(roles.indexOf(currentRole) + 1) % roles.length];
    Alert.alert('Change Role', `Set role to "${nextRole}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => { await changeUserRole(userId, nextRole); loadUsers(); } },
    ]);
  }

  async function handleAssignBadge(userId, currentBadgeId) {
    const options = [
      { text: 'None', onPress: () => assignBadge(userId, null).then(loadUsers) },
      ...badges.map((b) => ({
        text: b.name,
        onPress: () => assignBadge(userId, b.id).then(loadUsers),
      })),
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert('Assign Badge', 'Choose a badge:', options);
  }

  async function handleCreateBadge() {
    if (!newBadge.id || !newBadge.name || !newBadge.svgCode) {
      Alert.alert('Error', 'ID, Name, and SVG code are required');
      return;
    }
    const { error } = await createBadge({ ...newBadge, permissions: {
      max_file_size_mb: 500, can_create_group: false, can_moderate: false,
    }});
    if (error) Alert.alert('Error', error.message);
    else {
      setShowBadgeModal(false);
      setNewBadge({ id: '', name: '', description: '', svgCode: '', color: '#6366F1' });
      loadBadges();
    }
  }

  async function handleDeleteBadge(badgeId) {
    Alert.alert('Delete Badge', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteBadge(badgeId); loadBadges(); } },
    ]);
  }

  const s = makeStyles(theme);

  return (
    <View style={[s.container, { backgroundColor: t.background }]}>
      <View style={[s.header, { backgroundColor: t.headerBg, borderBottomColor: t.headerBorder }]}>
        <Text style={[s.title, { color: t.text }]}>Admin Panel</Text>
        <Text style={[s.subtitle, { color: t.textSecondary }]}>{totalUsers} total users</Text>
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: t.surface, borderBottomColor: t.headerBorder }]}>
        {['users', 'badges'].map((tabName) => (
          <TouchableOpacity
            key={tabName}
            style={[s.tab, tab === tabName && { borderBottomColor: t.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(tabName)}
          >
            <Text style={[s.tabText, { color: tab === tabName ? t.primary : t.textSecondary }]}>
              {tabName === 'users' ? '👥 Users' : '🏆 Badges'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={t.primary} style={{ marginTop: 40 }} />
      ) : tab === 'users' ? (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[s.userCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <View style={s.userInfo}>
                <View style={[s.userAvatar, { backgroundColor: item.is_banned ? t.error : t.primary }]}>
                  <Text style={s.userAvatarText}>{(item.display_name || '?')[0]}</Text>
                </View>
                <View style={s.userText}>
                  <Text style={[s.userName, { color: t.text }]}>{item.display_name}</Text>
                  <Text style={[s.userUsername, { color: t.textSecondary }]}>@{item.username}</Text>
                  <View style={s.tags}>
                    <View style={[s.tag, { backgroundColor: t.primary + '20' }]}>
                      <Text style={[s.tagText, { color: t.primary }]}>{item.role}</Text>
                    </View>
                    {item.is_banned && (
                      <View style={[s.tag, { backgroundColor: t.error + '20' }]}>
                        <Text style={[s.tagText, { color: t.error }]}>banned</Text>
                      </View>
                    )}
                    {item.badges && (
                      <View style={[s.tag, { backgroundColor: item.badges.color + '20' }]}>
                        <Text style={[s.tagText, { color: item.badges.color }]}>{item.badges.name}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <View style={s.userActions}>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.surfaceAlt }]} onPress={() => handleRoleChange(item.id, item.role)}>
                  <Ionicons name="shield-outline" size={16} color={t.text} />
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: t.surfaceAlt }]} onPress={() => handleAssignBadge(item.id, item.badge_id)}>
                  <Ionicons name="ribbon-outline" size={16} color={t.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: item.is_banned ? t.success + '20' : t.error + '20' }]}
                  onPress={() => handleBanUser(item.id, item.is_banned)}
                >
                  <Ionicons name={item.is_banned ? 'checkmark-circle-outline' : 'ban-outline'} size={16} color={item.is_banned ? t.success : t.error} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={{ padding: 12, gap: 8 }}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={[s.createBtn, { backgroundColor: t.primary }]}
            onPress={() => setShowBadgeModal(true)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.createBtnText}>Create New Badge</Text>
          </TouchableOpacity>
          <FlatList
            data={badges}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={[s.badgeCard, { backgroundColor: t.card, borderColor: item.color }]}>
                <SvgXml xml={item.svg_code} width={36} height={36} />
                <View style={s.badgeInfo}>
                  <Text style={[s.badgeName, { color: t.text }]}>{item.name}</Text>
                  <Text style={[s.badgeDesc, { color: t.textSecondary }]}>{item.description}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteBadge(item.id)}>
                  <Ionicons name="trash-outline" size={20} color={t.error} />
                </TouchableOpacity>
              </View>
            )}
            contentContainerStyle={{ padding: 12, gap: 8 }}
          />
        </View>
      )}

      {/* Badge Creation Modal */}
      <Modal visible={showBadgeModal} animationType="slide" transparent>
        <View style={[s.modal, { backgroundColor: t.overlay }]}>
          <View style={[s.modalContent, { backgroundColor: t.card }]}>
            <Text style={[s.modalTitle, { color: t.text }]}>Create Badge</Text>
            {[
              { key: 'id', label: 'Badge ID (unique, no spaces)', placeholder: 'e.g. premium' },
              { key: 'name', label: 'Name', placeholder: 'e.g. Premium Member' },
              { key: 'description', label: 'Description', placeholder: 'Badge description' },
              { key: 'color', label: 'Color (hex)', placeholder: '#6366F1' },
            ].map(({ key, label, placeholder }) => (
              <View key={key} style={{ marginBottom: 12 }}>
                <Text style={[s.modalLabel, { color: t.textSecondary }]}>{label}</Text>
                <TextInput
                  style={[s.modalInput, { backgroundColor: t.inputBg, color: t.inputText, borderColor: t.inputBorder }]}
                  value={newBadge[key]}
                  onChangeText={(v) => setNewBadge((prev) => ({ ...prev, [key]: v }))}
                  placeholder={placeholder}
                  placeholderTextColor={t.placeholder}
                />
              </View>
            ))}
            <Text style={[s.modalLabel, { color: t.textSecondary }]}>SVG Code</Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: t.inputBg, color: t.inputText, borderColor: t.inputBorder, height: 100, textAlignVertical: 'top' }]}
              value={newBadge.svgCode}
              onChangeText={(v) => setNewBadge((prev) => ({ ...prev, svgCode: v }))}
              placeholder="<svg ...>...</svg>"
              placeholderTextColor={t.placeholder}
              multiline
            />
            {newBadge.svgCode ? (
              <View style={s.svgPreview}>
                <Text style={[s.modalLabel, { color: t.textSecondary }]}>Preview:</Text>
                <SvgXml xml={newBadge.svgCode} width={40} height={40} />
              </View>
            ) : null}
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: t.surfaceAlt }]} onPress={() => setShowBadgeModal(false)}>
                <Text style={[s.modalBtnText, { color: t.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: t.primary }]} onPress={handleCreateBadge}>
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(theme) {
  const t = theme.colors;
  return StyleSheet.create({
    container: { flex: 1 },
    header: { paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 0.5 },
    title: { fontSize: 24, fontWeight: '700' },
    subtitle: { fontSize: 13, marginTop: 2 },
    tabs: { flexDirection: 'row', borderBottomWidth: 0.5 },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
    tabText: { fontSize: 14, fontWeight: '600' },
    userCard: { borderRadius: 14, borderWidth: 1, padding: 12 },
    userInfo: { flexDirection: 'row', gap: 12, marginBottom: 10 },
    userAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    userAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    userText: { flex: 1 },
    userName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    userUsername: { fontSize: 12, marginBottom: 6 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    tagText: { fontSize: 11, fontWeight: '600' },
    userActions: { flexDirection: 'row', gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, padding: 14, borderRadius: 14 },
    createBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    badgeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 12 },
    badgeInfo: { flex: 1 },
    badgeName: { fontSize: 15, fontWeight: '600' },
    badgeDesc: { fontSize: 12 },
    modal: { flex: 1, justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
    modalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
    modalInput: { borderRadius: 10, borderWidth: 1, padding: 10, fontSize: 14, marginBottom: 4 },
    svgPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
    modalBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center' },
    modalBtnText: { fontSize: 15, fontWeight: '600' },
  });
}
