// CallScreen.js — Voice & Video Call
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import RTCView from '../components/RTCView';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as webrtcService from '../services/webrtc';
import * as socketService from '../services/socket';

export default function CallScreen({ route, navigation }) {
  const { targetUserId, targetName, callType = 'video', isInitiator, offer } = route.params;
  const { theme } = useTheme();
  const { user } = useAuth();
  const t = theme.colors;
  useKeepAwake();

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callStatus, setCallStatus] = useState(isInitiator ? 'Calling...' : 'Connecting...');
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    startCall();

    const unsubs = [
      socketService.on('call_answered', ({ from, answer }) => {
        if (from === targetUserId) {
          webrtcService.handleAnswer({ fromUserId: from, answer });
          setCallStatus('Connected');
          startTimer();
        }
      }),
      socketService.on('ice_candidate', ({ from, candidate }) => {
        if (from === targetUserId) webrtcService.handleIceCandidate({ fromUserId: from, candidate });
      }),
      socketService.on('call_rejected', ({ from }) => {
        if (from === targetUserId) {
          Alert.alert('Call Rejected', `${targetName} declined the call`);
          endCall();
        }
      }),
      socketService.on('call_ended', ({ from }) => {
        if (from === targetUserId) endCall();
      }),
    ];

    webrtcService.setCallbacks({
      onRemoteStream: (userId, stream) => {
        if (userId === targetUserId) {
          setRemoteStream(stream);
          setCallStatus('Connected');
          startTimer();
        }
      },
    });

    return () => {
      unsubs.forEach((u) => u());
      clearInterval(timerRef.current);
    };
  }, []);

  async function startCall() {
    try {
      if (isInitiator) {
        const { localStream: ls } = await webrtcService.initiateCall({ targetUserId, callType });
        setLocalStream(ls);
      } else {
        const { localStream: ls } = await webrtcService.handleIncomingOffer({ fromUserId: targetUserId, offer, callType });
        setLocalStream(ls);
      }
    } catch (e) {
      Alert.alert('Call Error', e.message);
      navigation.goBack();
    }
  }

  function startTimer() {
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  }

  function formatDuration(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function endCall() {
    clearInterval(timerRef.current);
    socketService.endCall({ to: targetUserId });
    webrtcService.closeConnection(targetUserId);
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    navigation.goBack();
  }

  function toggleMute() {
    setIsMuted((prev) => { webrtcService.toggleMute(localStream, !prev); return !prev; });
  }

  function toggleCamera() {
    setIsCameraOff((prev) => { webrtcService.toggleCamera(localStream, !prev); return !prev; });
  }

  return (
    <View style={[styles.container, { backgroundColor: t.callBg }]}>
      {/* Remote Video */}
      {remoteStream && callType === 'video' ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={styles.audioCallBg}>
          <View style={[styles.bigAvatar, { backgroundColor: t.primary }]}>
            <Text style={styles.bigAvatarText}>{(targetName || '?')[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.bigName}>{targetName}</Text>
          <Text style={[styles.statusText, { color: 'rgba(255,255,255,0.7)' }]}>
            {callDuration > 0 ? formatDuration(callDuration) : callStatus}
          </Text>
        </View>
      )}

      {/* Local Video (PiP) */}
      {localStream && callType === 'video' && (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.localVideo}
          objectFit="cover"
          zOrder={1}
          mirror={true}
        />
      )}

      {/* Call Duration (for video) */}
      {callType === 'video' && callDuration > 0 && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={[styles.controls, { backgroundColor: t.callControls }]}>
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && { backgroundColor: t.error }]}
          onPress={toggleMute}
        >
          <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color="#fff" />
          <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        {callType === 'video' && (
          <TouchableOpacity
            style={[styles.controlBtn, isCameraOff && { backgroundColor: t.textMuted }]}
            onPress={toggleCamera}
          >
            <Ionicons name={isCameraOff ? 'videocam-off' : 'videocam'} size={24} color="#fff" />
            <Text style={styles.controlLabel}>{isCameraOff ? 'Show' : 'Hide'}</Text>
          </TouchableOpacity>
        )}

        {callType === 'video' && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => webrtcService.switchCamera(localStream)}
          >
            <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
            <Text style={styles.controlLabel}>Flip</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.controlBtn, styles.endBtn]}
          onPress={endCall}
        >
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          <Text style={styles.controlLabel}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  remoteVideo: { flex: 1 },
  audioCallBg: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  bigAvatar: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  bigAvatarText: { fontSize: 48, fontWeight: '700', color: '#fff' },
  bigName: { fontSize: 24, fontWeight: '700', color: '#fff' },
  statusText: { fontSize: 16 },
  localVideo: {
    position: 'absolute', top: 60, right: 16,
    width: 100, height: 140,
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: '#fff',
    zIndex: 10,
  },
  durationBadge: {
    position: 'absolute', top: 60, left: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
  },
  durationText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 24,
    paddingBottom: 40,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 64, height: 64,
    borderRadius: 32,
    justifyContent: 'center',
  },
  controlLabel: { color: '#fff', fontSize: 10, fontWeight: '500' },
  endBtn: { backgroundColor: '#EF4444', width: 72, height: 72, borderRadius: 36 },
});
