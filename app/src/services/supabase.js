// ============================================================
//  Supabase Client
// ============================================================
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ──────────────────────────────────────────────
//  Auth Functions
// ──────────────────────────────────────────────

export async function signUp({ email, password, username, displayName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username.toLowerCase().trim(),
        display_name: displayName.trim(),
      },
    },
  });
  return { data, error };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ──────────────────────────────────────────────
//  Profile Functions
// ──────────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, badges(*)')
    .eq('id', userId)
    .single();
  return { data, error };
}

export async function getMyProfile() {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };
  return getProfile(user.id);
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

export async function updateFCMToken(userId, fcmToken) {
  return updateProfile(userId, { fcm_token: fcmToken });
}

export async function updateLastSeen(userId) {
  return updateProfile(userId, { last_seen: new Date().toISOString() });
}

// ──────────────────────────────────────────────
//  User Search
// ──────────────────────────────────────────────

export async function searchUsers(query) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, badge_id, badges(name, svg_code, color)')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .eq('is_banned', false)
    .limit(20);
  return { data, error };
}

export async function getUserByUsername(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, fcm_token, badge_id, badges(name, svg_code, color)')
    .eq('username', username.toLowerCase().trim())
    .eq('is_banned', false)
    .single();
  return { data, error };
}

// ──────────────────────────────────────────────
//  Badge Functions
// ──────────────────────────────────────────────

export async function getAllBadges() {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .order('created_at', { ascending: true });
  return { data, error };
}

export async function assignBadge(userId, badgeId) {
  return updateProfile(userId, { badge_id: badgeId });
}

// ──────────────────────────────────────────────
//  Admin Functions
// ──────────────────────────────────────────────

export async function getAllUsers({ page = 1, pageSize = 20 } = {}) {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from('profiles')
    .select('*, badges(name, color)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  return { data, error, count };
}

export async function banUser(userId, ban = true) {
  return updateProfile(userId, { is_banned: ban });
}

export async function changeUserRole(userId, role) {
  return updateProfile(userId, { role });
}

export async function createBadge({ id, name, description, svgCode, color, permissions }) {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('badges')
    .insert({
      id,
      name,
      description,
      svg_code: svgCode,
      color,
      permissions,
      created_by: user?.id,
    })
    .select()
    .single();
  return { data, error };
}

export async function updateBadge(badgeId, updates) {
  const { data, error } = await supabase
    .from('badges')
    .update(updates)
    .eq('id', badgeId)
    .select()
    .single();
  return { data, error };
}

export async function deleteBadge(badgeId) {
  const { error } = await supabase.from('badges').delete().eq('id', badgeId);
  return { error };
}

// ──────────────────────────────────────────────
//  Image Upload (ImgBB)
// ──────────────────────────────────────────────

export async function uploadImageToImgBB(base64Image) {
  const { CONFIG } = await import('../config');
  try {
    const formData = new FormData();
    formData.append('key', CONFIG.IMGBB_API_KEY);
    formData.append('image', base64Image.replace(/^data:image\/\w+;base64,/, ''));

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (result.success) {
      return { url: result.data.url, deleteUrl: result.data.delete_url };
    }
    throw new Error(result.error?.message || 'Upload failed');
  } catch (e) {
    console.error('[ImgBB] Upload error:', e.message);
    return { url: null, error: e.message };
  }
}
