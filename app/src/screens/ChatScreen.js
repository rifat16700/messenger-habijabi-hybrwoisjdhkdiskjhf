// ============================================================
//  Chat Screen — 1-on-1 P2P Chat + File Transfer
//  Online: WebRTC Data Channel
//  Offline: file.io + HF buffer (Ephemeral)
// ============================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
  Animated, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import dayjs from 'dayjs';

import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as socketService from '../services/socket';
import * as webrtcService from '../services/webrtc';

export default function ChatScreen({ route, navigation }) {
  const { targetUserId, targetName, targetAvatar } = route.params;
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const t = theme.colors;

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTargetOnline, setIsTargetOnline] = useState(false);
  const [isP2PConnected, setIsP2PConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [fileProgress, setFileProgress] = useState(null); // { filename, progress }
  const [lostMessages, setLostMessages] = useState([]); // entries that failed

  const flatListRef = useRef(null);
  const STORAGE_KEY = `@chat_${user.id}_${targetUserId}`;

  // ── Load saved messages ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setMessages(JSON.parse(stored));
    });

    // Check if target is online
    socketService.checkUserStatus(targetUserId);

    return () => {
      // Close P2P connection when leaving chat
      // (optional — keep alive for background messaging)
    };
  }, []);

  // ── Socket Events ──
  useEffect(() => {
    const unsubs = [
      socketService.on('user_online', ({ userId }) => {
        if (userId === targetUserId) {
          setIsTargetOnline(true);
          // Initiate P2P data channel
          initiateDataChannel();
        }
      }),

      socketService.on('user_offline', ({ userId }) => {
        if (userId === targetUserId) {
          setIsTargetOnline(false);
          setIsP2PConnected(false);
        }
      }),

      socketService.on('user_status_response', ({ targetUserId: tid, isOnline }) => {
        if (tid === targetUserId) {
          setIsTargetOnline(isOnline);
          if (isOnline) initiateDataChannel();
        }
      }),

      // Incoming call offer (from this user to open call screen)
      socketService.on('incoming_call', (data) => {
        if (data.from === targetUserId) {
          navigation.navigate('IncomingCall', {
            callerId: data.from,
            callerName: data.callerName,
            callType: data.callType,
            offer: data.offer,
          });
        }
      }),

      // WebRTC answer
      socketService.on('call_answered', ({ from, answer }) => {
        if (from === targetUserId) {
          webrtcService.handleAnswer({ fromUserId: from, answer });
        }
      }),

      // ICE candidates
      socketService.on('ice_candidate', ({ from, candidate }) => {
        if (from === targetUserId) {
          webrtcService.handleIceCandidate({ fromUserId: from, candidate });
        }
      }),

      // Message via socket (fallback before P2P)
      socketService.on('new_message', (data) => {
        if (data.from === targetUserId) {
          receiveMessage({
            id: `${Date.now()}`,
            senderId: data.from,
            text: data.message?.text,
            type: data.message?.type || 'text',
            timestamp: data.originalTimestamp || new Date().toISOString(),
            isMine: false,
          });
        }
      }),

      // Offline message delivered
      socketService.on('offline_message_delivered', (data) => {
        if (data.senderId === targetUserId) {
          receiveMessage({
            id: `offline_${Date.now()}`,
            senderId: data.senderId,
            text: data.data?.text,
            type: data.data?.type || 'text',
            timestamp: data.originalTimestamp,
            isMine: false,
            wasOffline: true,
          });
        }
      }),

      // Message buffered (my message stored for offline user)
      socketService.on('message_buffered', (data) => {
        if (data.to === targetUserId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.bufferPending
                ? { ...m, bufferPending: false, buffered: true, entryId: data.entryId }
                : m
            )
          );
        }
      }),

      // Message lost (Ultra-Private Ephemeral)
      socketService.on('message_lost_notification', (data) => {
        const lostForTarget = (data.lostEntries || []).filter(
          (e) => e.receiverId === targetUserId
        );
        if (lostForTarget.length > 0) {
          setLostMessages(lostForTarget);
          setMessages((prev) =>
            prev.map((m) => {
              const lost = lostForTarget.find((e) => e.entryId === m.entryId);
              return lost ? { ...m, deliveryFailed: true, buffered: false } : m;
            })
          );
        }
      }),
    ];

    // WebRTC callbacks
    webrtcService.setCallbacks({
      onMessage: (userId, msg) => {
        if (userId === targetUserId) {
          receiveMessage({
            id: `p2p_${Date.now()}`,
            senderId: userId,
            text: msg.text,
            type: msg.type || 'text',
            timestamp: msg.timestamp,
            isMine: false,
            isP2P: true,
          });
        }
      },
      onDataChannelOpen: (userId) => {
        if (userId === targetUserId) setIsP2PConnected(true);
      },
      onDataChannelClose: (userId) => {
        if (userId === targetUserId) setIsP2PConnected(false);
      },
      onFileProgress: (userId, progress, filename) => {
        if (userId === targetUserId) setFileProgress({ filename, progress });
      },
      onFileReceived: (userId, fileData) => {
        if (userId === targetUserId) {
          setFileProgress(null);
          receiveMessage({
            id: `file_${Date.now()}`,
            senderId: userId,
            type: 'file',
            filename: fileData.filename,
            mimetype: fileData.mimetype,
            fileData: fileData.data,
            timestamp: fileData.timestamp,
            isMine: false,
          });
        }
      },
    });

    return () => unsubs.forEach((u) => u());
  }, [targetUserId]);

  // ── Initiate P2P Data Channel ──
  async function initiateDataChannel() {
    try {
      if (!webrtcService.isDataChannelOpen(targetUserId)) {
        await webrtcService.initiateCall({
          targetUserId,
          callType: 'data',
          withDataChannel: true,
        });
      }
    } catch (e) {
      console.error('[ChatScreen] Data channel init error:', e.message);
    }
  }

  // ── Receive + persist message ──
  function receiveMessage(msg) {
    setMessages((prev) => {
      const updated = [...prev, msg];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(-200)));
      return updated;
    });
    flatListRef.current?.scrollToEnd({ animated: true });
  }

  // ── Send Text Message ──
  async function sendTextMessage() {
    if (!inputText.trim()) return;
    setIsSending(true);

    const timestamp = new Date().toISOString();
    const msgId = `mine_${Date.now()}`;
    const msg = { id: msgId, senderId: user.id, text: inputText.trim(), type: 'text', timestamp, isMine: true };

    // Add to local messages immediately
    setMessages((prev) => {
      const updated = [...prev, msg];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(-200)));
      return updated;
    });
    setInputText('');

    if (isP2PConnected && webrtcService.isDataChannelOpen(targetUserId)) {
      // P2P — direct
      webrtcService.sendP2PMessage({ toUserId: targetUserId, text: inputText.trim(), timestamp });
    } else if (isTargetOnline) {
      // Online but no P2P yet — via socket
      socketService.sendMessage({
        to: targetUserId,
        message: { text: inputText.trim(), type: 'text' },
        originalTimestamp: timestamp,
      });
    } else {
      // Offline — buffer
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, bufferPending: true } : m)
      );
      socketService.sendMessage({
        to: targetUserId,
        message: { text: inputText.trim(), type: 'text' },
        originalTimestamp: timestamp,
      });
    }

    setIsSending(false);
    flatListRef.current?.scrollToEnd({ animated: true });
  }

  // ── Send File ──
  async function sendFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;

      const file = result.assets[0];
      const timestamp = new Date().toISOString();

      if (isP2PConnected && webrtcService.isDataChannelOpen(targetUserId)) {
        // P2P file transfer
        const fileData = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
        const arrayBuffer = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0)).buffer;

        // Add sending indicator
        const tempId = `file_sending_${Date.now()}`;
        setMessages((prev) => [...prev, {
          id: tempId, senderId: user.id, type: 'file',
          filename: file.name, sending: true, timestamp, isMine: true,
        }]);

        await webrtcService.sendP2PFile({
          toUserId: targetUserId,
          fileBuffer: arrayBuffer,
          filename: file.name,
          mimetype: file.mimeType || 'application/octet-stream',
          onProgress: (p) => setFileProgress({ filename: file.name, progress: p }),
        });

        setFileProgress(null);
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...m, sending: false } : m)
        );
      } else {
        // Offline file buffer via socket
        const fileData = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
        socketService.sendFileOffline({
          to: targetUserId,
          fileBase64: fileData,
          filename: file.name,
          mimetype: file.mimeType || 'application/octet-stream',
          originalTimestamp: timestamp,
        });

        setMessages((prev) => [...prev, {
          id: `file_buffered_${Date.now()}`,
          senderId: user.id,
          type: 'file',
          filename: file.name,
          buffered: true,
          timestamp,
          isMine: true,
        }]);
      }
    } catch (e) {
      Alert.alert('File Error', e.message);
    }
  }

  // ── Resend lost message ──
  async function resendMessage(msg) {
    const timestamp = msg.timestamp; // Keep original timestamp
    const newId = `resend_${Date.now()}`;

    setMessages((prev) =>
      prev.map((m) => m.id === msg.id ? { ...m, deliveryFailed: false, bufferPending: true } : m)
    );

    socketService.sendMessage({
      to: targetUserId,
      message: { text: msg.text, type: msg.type },
      originalTimestamp: timestamp, // Original time preserved
    });
  }

  // ── Start Call ──
  function startCall(callType) {
    navigation.navigate('Call', {
      targetUserId,
      targetName,
      targetAvatar,
      callType,
      isInitiator: true,
    });
  }

  const s = makeStyles(theme);

  return (
    <View style={[s.container, { backgroundColor: t.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: t.headerBg, borderBottomColor: t.headerBorder }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={s.headerInfo} 
          onPress={() => navigation.navigate('PublicProfile', { userId: targetUserId })}
          activeOpacity={0.7}
        >
          <View style={[s.headerAvatar, { backgroundColor: t.primary }]}>
            <Text style={s.headerAvatarText}>{(targetName || '?')[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={[s.headerName, { color: t.text }]}>{targetName}</Text>
            <Text style={[s.headerStatus, { color: isTargetOnline ? t.online : t.textMuted }]}>
              {isTargetOnline
                ? isP2PConnected ? '🔒 P2P Connected' : 'Online'
                : 'Offline'}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={s.callBtns}>
          <TouchableOpacity style={s.callBtn} onPress={() => startCall('audio')}>
            <Ionicons name="call-outline" size={22} color={t.text} />
          </TouchableOpacity>
          <TouchableOpacity style={s.callBtn} onPress={() => startCall('video')}>
            <Ionicons name="videocam-outline" size={22} color={t.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* File progress */}
      {fileProgress && (
        <View style={[s.progressBar, { backgroundColor: t.surface }]}>
          <Text style={[s.progressText, { color: t.textSecondary }]}>
            📎 {fileProgress.filename} — {Math.round(fileProgress.progress * 100)}%
          </Text>
          <View style={[s.progressTrack, { backgroundColor: t.inputBg }]}>
            <View style={[s.progressFill, { width: `${fileProgress.progress * 100}%`, backgroundColor: t.primary }]} />
          </View>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            msg={item}
            theme={theme}
            myId={user.id}
            onResend={() => resendMessage(item)}
          />
        )}
        contentContainerStyle={s.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={[s.inputRow, { backgroundColor: t.surface, borderTopColor: t.headerBorder }]}>
          <TouchableOpacity onPress={sendFile} style={s.attachBtn}>
            <Ionicons name="attach-outline" size={24} color={t.primary} />
          </TouchableOpacity>
          <TextInput
            style={[s.input, { backgroundColor: t.inputBg, color: t.inputText, borderColor: t.inputBorder }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message..."
            placeholderTextColor={t.placeholder}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: inputText.trim() ? t.primary : t.inputBg }]}
            onPress={sendTextMessage}
            disabled={!inputText.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={inputText.trim() ? '#fff' : t.textMuted}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Message Bubble ──
function MessageBubble({ msg, theme, myId, onResend }) {
  const t = theme.colors;
  const isMine = msg.isMine || msg.senderId === myId;

  function getStatusIcon() {
    if (msg.deliveryFailed) return '⚠️';
    if (msg.buffered) return '🕐';
    if (msg.bufferPending) return '⏳';
    if (msg.wasOffline) return '📬';
    if (msg.isP2P) return '🔒';
    return null;
  }

  const statusIcon = getStatusIcon();

  return (
    <View style={[bubbleStyles.wrap, isMine ? bubbleStyles.wrapRight : bubbleStyles.wrapLeft]}>
      <View style={[
        bubbleStyles.bubble,
        isMine
          ? { backgroundColor: t.myBubble, borderBottomRightRadius: 4 }
          : { backgroundColor: t.theirBubble, borderBottomLeftRadius: 4 },
        msg.deliveryFailed && { borderWidth: 1, borderColor: t.error },
      ]}>
        {/* File message */}
        {msg.type === 'file' ? (
          <View style={bubbleStyles.fileWrap}>
            <Ionicons name="document-outline" size={24} color={isMine ? t.myBubbleText : t.text} />
            <Text style={[bubbleStyles.fileText, { color: isMine ? t.myBubbleText : t.text }]}>
              {msg.filename || 'File'}
            </Text>
            {msg.sending && <ActivityIndicator size="small" color={isMine ? t.myBubbleText : t.primary} />}
          </View>
        ) : (
          <Text style={[bubbleStyles.text, { color: isMine ? t.myBubbleText : t.theirBubbleText }]}>
            {msg.text}
          </Text>
        )}

        {/* Timestamp + status */}
        <View style={bubbleStyles.meta}>
          <Text style={[bubbleStyles.time, { color: isMine ? 'rgba(255,255,255,0.6)' : t.textMuted }]}>
            {dayjs(msg.timestamp).format('HH:mm')}
          </Text>
          {statusIcon && <Text style={bubbleStyles.statusIcon}>{statusIcon}</Text>}
        </View>

        {/* Delivery failed + resend */}
        {msg.deliveryFailed && (
          <View style={bubbleStyles.failedWrap}>
            <Text style={[bubbleStyles.failedText, { color: t.error }]}>
              ⚠️ Not delivered — server restarted
            </Text>
            <TouchableOpacity onPress={onResend} style={[bubbleStyles.resendBtn, { backgroundColor: t.error }]}>
              <Text style={bubbleStyles.resendText}>Resend</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  wrap: { marginVertical: 2, paddingHorizontal: 12, maxWidth: '80%' },
  wrapRight: { alignSelf: 'flex-end' },
  wrapLeft: { alignSelf: 'flex-start' },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    maxWidth: '100%',
  },
  text: { fontSize: 15, lineHeight: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 4 },
  time: { fontSize: 11 },
  statusIcon: { fontSize: 11 },
  fileWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
  fileText: { fontSize: 14, fontWeight: '500', flex: 1 },
  failedWrap: { marginTop: 6, borderTopWidth: 0.5, borderTopColor: 'rgba(255,0,0,0.3)', paddingTop: 6 },
  failedText: { fontSize: 11, marginBottom: 4 },
  resendBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  resendText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

function makeStyles(theme) {
  const t = theme.colors;
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 52,
      paddingBottom: 10,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
    },
    backBtn: { padding: 8 },
    headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 4 },
    headerAvatar: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
    headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    headerName: { fontSize: 15, fontWeight: '600' },
    headerStatus: { fontSize: 12 },
    callBtns: { flexDirection: 'row', gap: 4 },
    callBtn: { padding: 8 },
    messageList: { padding: 8, paddingBottom: 12 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 8,
      paddingVertical: 8,
      gap: 8,
      borderTopWidth: 0.5,
    },
    attachBtn: { padding: 8, paddingBottom: 10 },
    input: {
      flex: 1,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      borderWidth: 1,
      maxHeight: 120,
    },
    sendBtn: {
      width: 40, height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressBar: { padding: 10, borderBottomWidth: 0.5 },
    progressText: { fontSize: 12, marginBottom: 4 },
    progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: 4, borderRadius: 2 },
  });
}
