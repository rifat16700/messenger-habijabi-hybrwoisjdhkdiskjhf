// GroupCallScreen.js — Conference Call (Tree Routing)
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import RTCView from '../components/RTCView';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as socketService from '../services/socket';
import * as webrtcService from '../services/webrtc';

export default function GroupCallScreen({ route, navigation }) {
  const { roomId, isHost, participants: initialParticipants } = route.params;
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const t = theme.colors;
  useKeepAwake();

  const [participants, setParticipants] = useState(initialParticipants || []);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    initConference();

    const unsubs = [
      socketService.on('conference_participant_joined', ({ participants: pts, subHosts }) => {
        setParticipants(pts);
        // Connect to new participant
      }),
      socketService.on('conference_participant_left', ({ participants: pts, reconnectNeeded }) => {
        setParticipants(pts);
        if (reconnectNeeded) {
          console.log('[GroupCall] Peer healing triggered');
        }
      }),
      socketService.on('conference_offer', async ({ from, offer, roomId: rId }) => {
        if (rId === roomId) {
          const { localStream: ls } = await webrtcService.handleIncomingOffer({ fromUserId: from, offer, callType: 'video' });
          if (!localStream) setLocalStream(ls);
        }
      }),
      socketService.on('conference_answer', ({ from, answer }) => {
        webrtcService.handleAnswer({ fromUserId: from, answer });
      }),
      socketService.on('conference_ice', ({ from, candidate }) => {
        webrtcService.handleIceCandidate({ fromUserId: from, candidate });
      }),
    ];

    webrtcService.setCallbacks({
      onRemoteStream: (userId, stream) => {
        setRemoteStreams((prev) => ({ ...prev, [userId]: stream }));
      },
    });

    return () => {
      unsubs.forEach((u) => u());
      leaveCall();
    };
  }, []);

  async function initConference() {
    // Join the room
    socketService.joinConference({ roomId });

    // Connect to other participants
    for (const participantId of (initialParticipants || [])) {
      if (participantId !== user.id) {
        try {
          const { localStream: ls } = await webrtcService.initiateCall({
            targetUserId: participantId,
            callType: 'video',
          });
          if (!localStream) setLocalStream(ls);
        } catch (e) {
          console.error('[GroupCall] Connect error:', e.message);
        }
      }
    }
  }

  function leaveCall() {
    socketService.leaveConference({ roomId });
    webrtcService.closeAllConnections();
    localStream?.getTracks().forEach((t) => t.stop());
  }

  function endAndLeave() {
    leaveCall();
    navigation.goBack();
  }

  const streamValues = Object.values(remoteStreams);

  return (
    <View style={[styles.container, { backgroundColor: '#0F0F13' }]}>
      {/* Remote Streams Grid */}
      <FlatList
        data={streamValues}
        numColumns={2}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => (
          <RTCView
            streamURL={item.toURL()}
            style={styles.gridVideo}
            objectFit="cover"
          />
        )}
        style={styles.grid}
        ListEmptyComponent={
          <View style={styles.waiting}>
            <Ionicons name="people-outline" size={60} color="rgba(255,255,255,0.3)" />
            <Text style={styles.waitingText}>Waiting for participants...</Text>
          </View>
        }
      />

      {/* Local PiP */}
      {localStream && (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.localPip}
          objectFit="cover"
          mirror
          zOrder={10}
        />
      )}

      {/* Participant count */}
      <View style={styles.participantsBadge}>
        <Ionicons name="people" size={14} color="#fff" />
        <Text style={styles.participantsText}>{participants.length} participants</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.btn, isMuted && { backgroundColor: '#EF4444' }]}
          onPress={() => { setIsMuted((p) => { webrtcService.toggleMute(localStream, !p); return !p; }); }}
        >
          <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, isCameraOff && { backgroundColor: '#64748B' }]}
          onPress={() => { setIsCameraOff((p) => { webrtcService.toggleCamera(localStream, !p); return !p; }); }}
        >
          <Ionicons name={isCameraOff ? 'videocam-off' : 'videocam'} size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.endBtn]} onPress={endAndLeave}>
          <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grid: { flex: 1 },
  gridVideo: { width: '50%', aspectRatio: 1, borderWidth: 1, borderColor: '#000' },
  waiting: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 120, gap: 16 },
  waitingText: { color: 'rgba(255,255,255,0.4)', fontSize: 16 },
  localPip: { position: 'absolute', top: 60, right: 12, width: 90, height: 130, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  participantsBadge: { position: 'absolute', top: 60, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  participantsText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 20, padding: 24, paddingBottom: 40, backgroundColor: 'rgba(15,15,19,0.9)' },
  btn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  endBtn: { backgroundColor: '#EF4444' },
});
