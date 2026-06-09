// IncomingCallScreen.js — Full Screen Incoming Call
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import * as socketService from '../services/socket';
import * as webrtcService from '../services/webrtc';

export default function IncomingCallScreen({ route, navigation }) {
  const { callerId, callerName, callType, offer } = route.params;
  const { theme } = useTheme();

  useEffect(() => {
    // Vibrate repeatedly for incoming call
    const pattern = [0, 1000, 500, 1000, 500, 1000];
    Vibration.vibrate(pattern, true);
    return () => Vibration.cancel();
  }, []);

  function accept() {
    Vibration.cancel();
    navigation.replace('Call', {
      targetUserId: callerId,
      targetName: callerName,
      callType,
      isInitiator: false,
      offer,
    });
  }

  function decline() {
    Vibration.cancel();
    socketService.rejectCall({ to: callerId });
    navigation.goBack();
  }

  return (
    <LinearGradient colors={['#1A1A2E', '#16213E', '#0F0F13']} style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.callType}>{callType === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call'}</Text>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(callerName || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={styles.ring1} />
          <View style={styles.ring2} />
        </View>
        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.callerSub}>is calling you...</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={decline}>
          <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          <Text style={styles.actionLabel}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={accept}>
          <Ionicons name="call" size={32} color="#fff" />
          <Text style={styles.actionLabel}>Accept</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', paddingVertical: 80 },
  content: { alignItems: 'center', gap: 16 },
  callType: { color: 'rgba(255,255,255,0.6)', fontSize: 16 },
  avatarWrap: { position: 'relative', width: 160, height: 160, justifyContent: 'center', alignItems: 'center', marginVertical: 16 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', zIndex: 3 },
  ring1: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: 'rgba(99,102,241,0.4)', zIndex: 2 },
  ring2: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: 'rgba(99,102,241,0.2)', zIndex: 1 },
  avatarText: { fontSize: 48, fontWeight: '700', color: '#fff' },
  callerName: { fontSize: 28, fontWeight: '700', color: '#fff' },
  callerSub: { fontSize: 16, color: 'rgba(255,255,255,0.6)' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 60 },
  actionBtn: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', gap: 4 },
  actionLabel: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 2 },
  declineBtn: { backgroundColor: '#EF4444' },
  acceptBtn: { backgroundColor: '#10B981' },
});
