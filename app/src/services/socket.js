// ============================================================
//  Socket.io Service — Signaling & Online Presence
// ============================================================
import { io } from 'socket.io-client';
import { CONFIG } from '../config';

let socket = null;
let currentUserId = null;

const eventHandlers = new Map();

// ──────────────────────────────────────────────
//  Connect to signaling server
// ──────────────────────────────────────────────
export function connectSocket({ userId, username, displayName, fcmToken }) {
  if (socket?.connected) {
    console.log('[Socket] Already connected');
    return socket;
  }

  socket = io(CONFIG.SIGNALING_SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    timeout: 20000,
  });

  currentUserId = userId;

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    // Register with server
    socket.emit('register', { userId, username, displayName, fcmToken });
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    emit('socket_disconnected', { reason });
  });

  socket.on('reconnect', () => {
    console.log('[Socket] Reconnected');
    socket.emit('register', { userId, username, displayName, fcmToken });
    emit('socket_reconnected');
  });

  // Forward all server events to local handlers
  const serverEvents = [
    'user_online',
    'user_offline',
    'online_users_list',
    'user_status_response',
    'incoming_call',
    'call_answered',
    'call_rejected',
    'call_ended',
    'ice_candidate',
    'new_message',
    'message_buffered',
    'file_buffered',
    'offline_message_delivered',
    'message_lost_notification',
    'conference_invite',
    'conference_participant_joined',
    'conference_participant_left',
    'conference_offer',
    'conference_answer',
    'conference_ice',
    'conference_error',
    'call_failed',
    'pong_keepalive',
  ];

  serverEvents.forEach((event) => {
    socket.on(event, (data) => {
      emit(event, data);
    });
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentUserId = null;
  }
}

export function getSocket() {
  return socket;
}

export function isConnected() {
  return socket?.connected ?? false;
}

// ──────────────────────────────────────────────
//  Event System (local pub/sub)
// ──────────────────────────────────────────────
export function on(event, handler) {
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set());
  }
  eventHandlers.get(event).add(handler);
  return () => off(event, handler); // returns cleanup function
}

export function off(event, handler) {
  eventHandlers.get(event)?.delete(handler);
}

function emit(event, data) {
  eventHandlers.get(event)?.forEach((handler) => {
    try {
      handler(data);
    } catch (e) {
      console.error(`[Socket] Handler error for ${event}:`, e);
    }
  });
}

// ──────────────────────────────────────────────
//  Emit to server
// ──────────────────────────────────────────────
export function sendMessage({ to, message, originalTimestamp }) {
  if (!socket?.connected) {
    console.warn('[Socket] Not connected — cannot send message');
    return false;
  }
  socket.emit('send_message', { to, message, originalTimestamp });
  return true;
}

export function sendFileOffline({ to, fileBase64, filename, mimetype, originalTimestamp }) {
  socket?.emit('send_file_offline', { to, fileBase64, filename, mimetype, originalTimestamp });
}

export function sendOffer({ to, offer, callType }) {
  socket?.emit('offer', { to, offer, callType });
}

export function sendAnswer({ to, answer }) {
  socket?.emit('answer', { to, answer });
}

export function sendIceCandidate({ to, candidate }) {
  socket?.emit('ice_candidate', { to, candidate });
}

export function rejectCall({ to, reason = 'declined' }) {
  socket?.emit('call_rejected', { to, reason });
}

export function endCall({ to }) {
  socket?.emit('call_ended', { to });
}

export function checkUserStatus(targetUserId) {
  socket?.emit('check_user_status', { targetUserId });
}

// Conference
export function createConference({ roomId, participants }) {
  socket?.emit('create_conference', { roomId, participants });
}

export function joinConference({ roomId }) {
  socket?.emit('join_conference', { roomId });
}

export function leaveConference({ roomId }) {
  socket?.emit('leave_conference', { roomId });
}

export function sendConferenceOffer({ to, offer, roomId }) {
  socket?.emit('conference_offer', { to, offer, roomId });
}

export function sendConferenceAnswer({ to, answer, roomId }) {
  socket?.emit('conference_answer', { to, answer, roomId });
}

export function sendConferenceIce({ to, candidate, roomId }) {
  socket?.emit('conference_ice', { to, candidate, roomId });
}

// Keep-alive ping
export function pingServer() {
  socket?.emit('ping_keepalive');
}
