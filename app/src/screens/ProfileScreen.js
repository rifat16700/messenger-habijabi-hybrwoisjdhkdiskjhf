// ProfileScreen.js — User Profile + Settings
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { uploadImageToImgBB, updateProfile } from '../services/supabase';

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const t = theme.colors;
  const [uploading, setUploading] = useState(false);

  async function changeAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'Images', allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
    if (result.canceled) return;
    setUploading(true);
    const { url } = await uploadImageToImgBB(result.assets[0].base64);
    if (url) {
      await updateProfile(user.id, { avatar_url: url });
      await refreshProfile();
    } else {
      Alert.alert('Upload Failed', 'Could not upload image');
    }
    setUploading(false);
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: t.background }]}>
      <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.headerBorder }]}>
        <Text style={[styles.title, { color: t.text }]}>Profile</Text>
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={changeAvatar} style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: t.primary }]}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
              : <Text style={styles.avatarText}>{(profile?.display_name || 'U')[0]}</Text>}
          </View>
          <View style={[styles.editIcon, { backgroundColor: t.primary }]}>
            <Ionicons name={uploading ? 'hourglass' : 'camera'} size={14} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.nameRow}>
          <Text style={[styles.displayName, { color: t.text }]}>{profile?.display_name}</Text>
          {profile?.badges?.svg_code && (
            <SvgXml xml={profile.badges.svg_code} width={20} height={20} style={{ marginLeft: 6 }} />
          )}
        </View>
        <Text style={[styles.username, { color: t.textSecondary }]}>@{profile?.username}</Text>
        {profile?.badges && (
          <View style={[styles.badgeWrap, { backgroundColor: profile.badges.color + '20', borderColor: profile.badges.color }]}>
            <Text style={[styles.badgeLabel, { color: profile.badges.color }]}>{profile.badges.name}</Text>
          </View>
        )}
      </View>

      {/* Settings */}
      <View style={[styles.section, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: t.textSecondary }]}>APPEARANCE</Text>
        <View style={[styles.row, { borderBottomColor: t.divider }]}>
          <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={t.primary} />
          <Text style={[styles.rowText, { color: t.text }]}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: t.inputBorder, true: t.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: t.textSecondary }]}>ACCOUNT</Text>
        <View style={[styles.row, { borderBottomColor: t.divider }]}>
          <Ionicons name="mail-outline" size={20} color={t.textMuted} />
          <Text style={[styles.rowText, { color: t.text }]}>{user?.email}</Text>
        </View>
        <View style={[styles.row, { borderBottomColor: t.divider }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={t.textMuted} />
          <Text style={[styles.rowText, { color: t.text }]}>Role: {profile?.role}</Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: t.textSecondary }]}>PRIVACY</Text>
        <View style={[styles.row, { borderBottomColor: t.divider }]}>
          <Ionicons name="lock-closed-outline" size={20} color={t.success} />
          <Text style={[styles.rowText, { color: t.text }]}>End-to-End Encrypted (P2P)</Text>
        </View>
        <View style={[styles.row, { borderBottomColor: t.divider }]}>
          <Ionicons name="server-outline" size={20} color={t.success} />
          <Text style={[styles.rowText, { color: t.text }]}>Zero server storage</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.signOutBtn, { backgroundColor: t.error + '15', borderColor: t.error }]}
        onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: signOut },
        ])}
      >
        <Ionicons name="log-out-outline" size={20} color={t.error} />
        <Text style={[styles.signOutText, { color: t.error }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 0.5 },
  title: { fontSize: 24, fontWeight: '700' },
  avatarSection: { alignItems: 'center', paddingVertical: 32 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: 96, height: 96 },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  editIcon: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  displayName: { fontSize: 22, fontWeight: '700' },
  username: { fontSize: 14, marginBottom: 10 },
  badgeWrap: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeLabel: { fontSize: 13, fontWeight: '600' },
  section: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: '700', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 0.5 },
  rowText: { flex: 1, fontSize: 15 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginVertical: 24, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  signOutText: { fontSize: 15, fontWeight: '600' },
});
