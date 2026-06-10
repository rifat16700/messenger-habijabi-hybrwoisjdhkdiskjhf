import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import * as api from '../services/api';

export default function PublicProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const { theme } = useTheme();
  const t = theme.colors;
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await api.get(`/api/users/${userId}`);
      if (res.user) {
        setProfile(res.user);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const s = makeStyles(theme);

  if (loading) {
    return (
      <View style={[s.container, s.center, { backgroundColor: t.background }]}>
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[s.container, s.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.text }}>User not found.</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={{ color: t.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: t.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: t.headerBg, borderBottomColor: t.headerBorder }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Avatar Section */}
        <View style={s.avatarContainer}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, { backgroundColor: profile.avatarColor || t.primary }]}>
              <Text style={s.avatarLetter}>{(profile.displayName || '?')[0].toUpperCase()}</Text>
            </View>
          )}
          <Text style={[s.name, { color: t.text }]}>{profile.displayName}</Text>
          <Text style={[s.username, { color: t.textSecondary }]}>@{profile.username}</Text>
          <View style={[s.uidBadge, { backgroundColor: t.inputBg }]}>
            <Ionicons name="finger-print" size={14} color={t.primaryLight} style={{ marginRight: 4 }} />
            <Text style={{ color: t.text, fontSize: 13, fontWeight: '600', letterSpacing: 1 }}>{profile.id}</Text>
          </View>
        </View>

        {/* Details Section */}
        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: t.primary }]}>Info</Text>
          
          <View style={s.infoRow}>
            <Ionicons name="information-circle-outline" size={20} color={t.textSecondary} style={s.infoIcon} />
            <View>
              <Text style={[s.infoLabel, { color: t.textSecondary }]}>Bio</Text>
              <Text style={[s.infoValue, { color: t.text }]}>{profile.bio || "This user hasn't added a bio yet."}</Text>
            </View>
          </View>

          {profile.location && (
            <View style={s.infoRow}>
              <Ionicons name="location-outline" size={20} color={t.textSecondary} style={s.infoIcon} />
              <View>
                <Text style={[s.infoLabel, { color: t.textSecondary }]}>Location</Text>
                <Text style={[s.infoValue, { color: t.text }]}>{profile.location}</Text>
              </View>
            </View>
          )}

          {profile.website && (
            <View style={s.infoRow}>
              <Ionicons name="link-outline" size={20} color={t.textSecondary} style={s.infoIcon} />
              <View>
                <Text style={[s.infoLabel, { color: t.textSecondary }]}>Website</Text>
                <Text style={[s.infoValue, { color: t.primary }]}>{profile.website}</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme) {
  const t = theme.colors;
  return StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 52,
      paddingBottom: 12,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
    },
    iconBtn: { padding: 8 },
    headerTitle: { fontSize: 18, fontWeight: '600', marginLeft: 8 },
    scroll: { padding: 16, paddingBottom: 40 },
    avatarContainer: {
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 30,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    avatarLetter: {
      fontSize: 40,
      fontWeight: '700',
      color: '#fff',
    },
    name: {
      fontSize: 24,
      fontWeight: '700',
      marginBottom: 4,
    },
    username: {
      fontSize: 16,
      marginBottom: 12,
    },
    uidBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    card: {
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 16,
    },
    infoRow: {
      flexDirection: 'row',
      marginBottom: 20,
      paddingRight: 20,
    },
    infoIcon: {
      marginTop: 2,
      marginRight: 12,
    },
    infoLabel: {
      fontSize: 12,
      marginBottom: 4,
    },
    infoValue: {
      fontSize: 15,
      lineHeight: 22,
    },
    backBtn: {
      marginTop: 20,
      padding: 10,
    }
  });
}
