// ============================================================
//  Auth Context — Global User Session Management
// ============================================================
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, getProfile, updateFCMToken, updateLastSeen } from '../services/supabase';
import { registerForPushNotifications } from '../services/notifications';
import { connectSocket, disconnectSocket, pingServer } from '../services/socket';
import { CONFIG } from '../config';

const AuthContext = createContext({
  user: null,
  profile: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        initializeUser(session.user);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'SIGNED_IN' && session?.user) {
          await initializeUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          disconnectSocket();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Keep-alive ping every 3 hours
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      pingServer();
      updateLastSeen(user.id);
    }, CONFIG.KEEPALIVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user]);

  async function initializeUser(authUser) {
    setIsLoading(true);
    try {
      // Load profile
      const { data: profileData } = await getProfile(authUser.id);
      setProfile(profileData);

      // Register for push notifications
      const fcmToken = await registerForPushNotifications();
      if (fcmToken && profileData) {
        await updateFCMToken(authUser.id, fcmToken);
      }

      // Connect to signaling server
      connectSocket({
        userId: authUser.id,
        username: profileData?.username,
        displayName: profileData?.display_name,
        fcmToken,
      });

      await updateLastSeen(authUser.id);
    } catch (e) {
      console.error('[Auth] Initialize user error:', e.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function signOut() {
    disconnectSocket();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }

  async function refreshProfile() {
    if (!user) return;
    const { data } = await getProfile(user.id);
    setProfile(data);
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, isLoading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
