// ============================================================
//  The Hybrid Engine — Signaling Server
//  Hugging Face Space (Node.js + Socket.io)
//  Zero-cost P2P Chat & Calling App
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const offlineBuffer = require('./offlineBuffer');
const fcm = require('./fcmHelper');

// ── Persistent FCM token store ──
// User offline থাকলেও তার token রেখে দেওয়া
const FCM_TOKENS_FILE = path.join(__dirname, 'fcmTokens.json');
function loadFcmTokens() {
  try {
    if (fs.existsSync(FCM_TOKENS_FILE)) return JSON.parse(fs.readFileSync(FCM_TOKENS_FILE, 'utf8'));
  } catch (e) { /* ignore */ }
  return {};
}
function saveFcmToken(userId, token) {
  if (!token) return;
  try {
    const tokens = loadFcmTokens();
    tokens[userId] = token;
    fs.writeFileSync(FCM_TOKENS_FILE, JSON.stringify(tokens, null, 2));
  } catch (e) { /* ignore */ }
}
function getFcmToken(userId) {
  const tokens = loadFcmTokens();
  return tokens[userId] || null;
}

// ── Simple in-memory user store (persisted to users.json) ──
// Format: { id, username, displayName, passwordHash, createdAt }
const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) { /* ignore */ }
  return [];
}
function saveUsers(users) {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } catch (e) { /* ignore */ }
}
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'hybrid_engine_salt').digest('hex');
}
function generateToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64');
  const sig = crypto.createHash('sha256').update(payload + 'hybrid_jwt_secret').digest('hex');
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  try {
    const [payload, sig] = token.split('.');
    const expected = crypto.createHash('sha256').update(payload + 'hybrid_jwt_secret').digest('hex');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch { return null; }
}

// ──────────────────────────────────────────────
//  Setup
// ──────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 50 * 1024 * 1024, // 50MB max socket payload
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize Firebase (gracefully skips if config not set)
fcm.initFirebase();

// ──────────────────────────────────────────────
//  In-Memory State
//  userId → { socketId, fcmToken, username, displayName }
// ──────────────────────────────────────────────
const onlineUsers = new Map();

// roomId → { hostId, subHosts: [id1, id2], participants: Set<id> }
const conferenceRooms = new Map();

// ──────────────────────────────────────────────
//  Helper: Find socket ID by userId
// ──────────────────────────────────────────────
function getSocketId(userId) {
  const user = onlineUsers.get(userId);
  return user ? user.socketId : null;
}

// ──────────────────────────────────────────────
//  On Server Startup: Notify senders of lost messages
//  (Ultra-Private Ephemeral Feature)
// ──────────────────────────────────────────────
function notifyLostMessagesOnStartup() {
  // When server restarts, offline_buffer.json might be fresh (empty).
  // The buffer was lost. We note lost entries if the file still exists.
  // In practice, HF restarts wipe the file — this handles the edge case
  // where the file survives but we want to track it.
  const lostMap = offlineBuffer.getLostMessageSenders();
  // We'll notify senders when they come online via 'lost_messages' event
  // Store in memory for this session
  app._lostMessages = lostMap;
  const totalSenders = Object.keys(lostMap).length;
  if (totalSenders > 0) {
    console.log(`[Server] ${totalSenders} sender(s) have messages that may be undeliverable`);
  }
}

notifyLostMessagesOnStartup();

// ──────────────────────────────────────────────
//  Socket.io — Main Connection Handler
// ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] New connection: ${socket.id}`);

  // ── REGISTER ──
  // Client sends: { userId, username, displayName, fcmToken }
  socket.on('register', async (data) => {
    const { userId, username, displayName, fcmToken } = data;
    if (!userId) return;

    // Update online map
    onlineUsers.set(userId, {
      socketId: socket.id,
      fcmToken: fcmToken || null,
      username,
      displayName,
      connectedAt: new Date().toISOString(),
    });

    socket.userId = userId;
    console.log(`[Socket] User registered: ${displayName} (${userId})`);
    
    // Save FCM token persistently so we can push when user goes offline later
    if (fcmToken) saveFcmToken(userId, fcmToken);

    // Broadcast online status to all
    socket.broadcast.emit('user_online', { userId, username, displayName });

    // Deliver any pending offline messages
    const pending = await offlineBuffer.deliverPendingMessages(userId);
    if (pending.length > 0) {
      for (const { entry, data: msgData, expired } of pending) {
        if (expired || !msgData) continue;
        if (entry.type === 'file') {
          socket.emit('offline_file_delivered', {
            entryId: entry.id,
            senderId: entry.senderId,
            senderName: entry.senderName,
            originalTimestamp: entry.originalTimestamp,
            data: msgData,
          });
        } else {
          socket.emit('offline_message_delivered', {
            entryId: entry.id,
            senderId: entry.senderId,
            senderName: entry.senderName,
            type: entry.type,
            originalTimestamp: entry.originalTimestamp,
            data: msgData,
          });
        }
      }
      console.log(`[Socket] Delivered ${pending.length} offline message(s) to ${userId}`);
    }

    // Notify if this sender had messages lost due to server restart
    const lostMap = app._lostMessages || {};
    if (lostMap[userId] && lostMap[userId].length > 0) {
      socket.emit('message_lost_notification', {
        lostEntries: lostMap[userId],
        message: 'Some of your messages were lost due to server restart. Please resend them.',
      });
      // Clear from memory after notifying
      delete app._lostMessages[userId];
    }

    // Send current online users list to the newly connected user
    const onlineList = [];
    onlineUsers.forEach((info, uid) => {
      if (uid !== userId) {
        onlineList.push({ userId: uid, username: info.username, displayName: info.displayName });
      }
    });
    socket.emit('online_users_list', onlineList);
  });

  // ── CHECK USER ONLINE STATUS ──
  socket.on('check_user_status', ({ targetUserId }) => {
    const isOnline = onlineUsers.has(targetUserId);
    socket.emit('user_status_response', { targetUserId, isOnline });
  });

  // ── SEND TEXT MESSAGE ──
  // If target is online → P2P via WebRTC signaling
  // If target is offline → store in offline buffer
  socket.on('send_message', async (data) => {
    const { to, message, originalTimestamp } = data;
    const fromUser = onlineUsers.get(socket.userId);
    if (!fromUser) return;

    const targetSocketId = getSocketId(to);

    if (targetSocketId) {
      // Target is online — forward via socket (WebRTC data channel takes over from here)
      io.to(targetSocketId).emit('new_message', {
        from: socket.userId,
        senderName: fromUser.displayName,
        message,
        originalTimestamp: originalTimestamp || new Date().toISOString(),
      });
    } else {
      // Target is offline — buffer it
      const msgPayload = {
        text: message.text,
        type: message.type || 'text',
        senderId: socket.userId,
        senderName: fromUser.displayName || fromUser.username,
        originalTimestamp: originalTimestamp || new Date().toISOString(),
      };

      const result = await offlineBuffer.saveOfflineMessage(to, msgPayload);

      // Notify sender of buffered status
      socket.emit('message_buffered', {
        to,
        entryId: result.entryId,
        originalTimestamp: msgPayload.originalTimestamp,
        status: result.success ? 'buffered' : 'failed',
      });

      // Try FCM push notification for offline delivery
      const offlineFcmToken = getFcmToken(to);
      if (offlineFcmToken) {
        const pendingCount = offlineBuffer.getPendingCount(to);
        fcm.sendMessageNotification({
          fcmToken: offlineFcmToken,
          senderId: socket.userId,
          senderName: fromUser.displayName || fromUser.username,
          messagePreview: message.text?.slice(0, 60),
          pendingCount,
        });
      }
      console.log(`[Socket] Message from ${socket.userId} buffered for offline user ${to}`);
    }
  });

  // ── FILE CHUNK HANDLER (chunked file transfer) ──
  // Online: chunk গুলো সরাসরি receiver-এর কাছে forward করা
  // Offline: সব chunk এসে গেলে disk-এ save করা
  const _serverChunkBuffers = {}; // transferId → { chunks, received, meta }

  socket.on('file_chunk', async (data) => {
    const { to, transferId, chunkIndex, totalChunks, base64Chunk,
      filename, mimetype, fileSize, senderName, originalTimestamp, isLastChunk } = data;

    const fromUser = onlineUsers.get(socket.userId);
    if (!fromUser) return;

    const targetSocketId = getSocketId(to);

    if (targetSocketId) {
      // Receiver online — forward chunk সরাসরি
      io.to(targetSocketId).emit('file_chunk', {
        ...data,
        senderId: socket.userId,
        senderName: fromUser.displayName || fromUser.username,
      });
      return;
    }

    // Receiver offline — chunk জমা করো, শেষে disk-এ save করো
    if (!_serverChunkBuffers[transferId]) {
      _serverChunkBuffers[transferId] = {
        chunks: new Array(totalChunks),
        received: 0,
        meta: { to, filename, mimetype, fileSize, originalTimestamp },
      };
    }

    const buf = _serverChunkBuffers[transferId];
    buf.chunks[chunkIndex] = base64Chunk;
    buf.received++;

    if (buf.received === totalChunks) {
      // সব chunk এসে গেছে — combine করে disk-এ save করো
      const fullBase64 = buf.chunks.join('');
      const fileBuffer = Buffer.from(fullBase64, 'base64');
      delete _serverChunkBuffers[transferId];

      const result = await offlineBuffer.saveOfflineFile(
        to,
        fileBuffer,
        filename,
        mimetype,
        socket.userId,
        fromUser.displayName || fromUser.username,
        originalTimestamp || new Date().toISOString()
      );

      // Sender-কে জানাও যে buffered হয়েছে
      socket.emit('file_buffered', {
        to, filename,
        entryId: result.entryId,
        status: result.success ? 'buffered' : 'failed',
      });

      // FCM push পাঠাও
      const offlineFcmToken = getFcmToken(to);
      if (offlineFcmToken) {
        fcm.sendMessageNotification({
          fcmToken: offlineFcmToken,
          senderId: socket.userId,
          senderName: fromUser.displayName || fromUser.username,
          messagePreview: `Sent a file: ${filename}`,
          pendingCount: offlineBuffer.getPendingCount(to),
        });
      }

      console.log(`[Socket] File "${filename}" buffered to disk for offline user ${to}`);
    }
  });

  // ──────────────────────────────────────────────
  //  WebRTC SIGNALING (1-on-1 calls & chat)
  // ──────────────────────────────────────────────

  // Offer (call initiation)
  socket.on('offer', (data) => {
    const { to, offer, callType, targetFcmToken } = data;
    const fromUser = onlineUsers.get(socket.userId);
    const targetSocketId = getSocketId(to);

    if (targetSocketId && fromUser) {
      io.to(targetSocketId).emit('incoming_call', {
        from: socket.userId,
        callerName: fromUser.displayName || fromUser.username,
        callType: callType || 'video',
        offer,
      });
      console.log(`[WebRTC] Offer from ${socket.userId} to ${to}`);
    } else if (!targetSocketId) {
      // User offline — try FCM if we received the token from the caller
      if (targetFcmToken && fromUser) {
        console.log(`[WebRTC] Target ${to} offline — sending FCM push via provided token`);
        fcm.sendCallNotification({
          fcmToken: targetFcmToken,
          callerName: fromUser.displayName || fromUser.username,
          callerId: socket.userId,
          callType: callType || 'video'
        });
        // We still emit call_failed to the caller so they know the user isn't actively online right now
        // Or we could wait a few seconds. For simplicity, we just say offline.
      } else {
        console.log(`[WebRTC] Target ${to} offline — no FCM token provided`);
      }
      socket.emit('call_failed', { to, reason: 'user_offline' });
    }
  });

  // Answer
  socket.on('answer', (data) => {
    const { to, answer } = data;
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_answered', {
        from: socket.userId,
        answer,
      });
    }
  });

  // ICE Candidates
  socket.on('ice_candidate', (data) => {
    const { to, candidate } = data;
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice_candidate', {
        from: socket.userId,
        candidate,
      });
    }
  });

  // Call rejected
  socket.on('call_rejected', (data) => {
    const { to, reason } = data;
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_rejected', {
        from: socket.userId,
        reason: reason || 'declined',
      });
    }
  });

  // Call ended
  socket.on('call_ended', (data) => {
    const { to } = data;
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended', { from: socket.userId });
    }
  });

  // ──────────────────────────────────────────────
  //  CONFERENCE CALL — Tree / Sub-host Routing
  // ──────────────────────────────────────────────

  // Create conference room
  socket.on('create_conference', (data) => {
    const { roomId, participants } = data;
    const room = {
      hostId: socket.userId,
      subHosts: [],
      participants: new Set([socket.userId]),
    };
    conferenceRooms.set(roomId, room);

    // Invite participants
    for (const participantId of participants || []) {
      const targetSocketId = getSocketId(participantId);
      if (targetSocketId) {
        const host = onlineUsers.get(socket.userId);
        io.to(targetSocketId).emit('conference_invite', {
          roomId,
          hostId: socket.userId,
          hostName: host?.displayName || host?.username,
        });
      }
    }

    socket.join(roomId);
    console.log(`[Conference] Room ${roomId} created by ${socket.userId}`);
  });

  // Join conference
  socket.on('join_conference', (data) => {
    const { roomId } = data;
    const room = conferenceRooms.get(roomId);
    if (!room) {
      socket.emit('conference_error', { message: 'Room not found' });
      return;
    }

    socket.join(roomId);
    room.participants.add(socket.userId);

    // Assign as sub-host if needed (max 2 sub-hosts)
    if (room.subHosts.length < 2) {
      room.subHosts.push(socket.userId);
    }

    // Notify everyone in room
    io.to(roomId).emit('conference_participant_joined', {
      userId: socket.userId,
      username: onlineUsers.get(socket.userId)?.displayName,
      participants: [...room.participants],
      subHosts: room.subHosts,
    });

    console.log(`[Conference] ${socket.userId} joined room ${roomId}`);
  });

  // Conference signaling (offer/answer within room)
  socket.on('conference_offer', (data) => {
    const { to, offer, roomId } = data;
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('conference_offer', {
        from: socket.userId,
        offer,
        roomId,
      });
    }
  });

  socket.on('conference_answer', (data) => {
    const { to, answer, roomId } = data;
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('conference_answer', {
        from: socket.userId,
        answer,
        roomId,
      });
    }
  });

  socket.on('conference_ice', (data) => {
    const { to, candidate, roomId } = data;
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('conference_ice', {
        from: socket.userId,
        candidate,
        roomId,
      });
    }
  });

  // Leave conference — trigger Peer Healing
  socket.on('leave_conference', (data) => {
    const { roomId } = data;
    const room = conferenceRooms.get(roomId);
    if (!room) return;

    room.participants.delete(socket.userId);
    room.subHosts = room.subHosts.filter((id) => id !== socket.userId);
    socket.leave(roomId);

    if (room.participants.size === 0) {
      conferenceRooms.delete(roomId);
      console.log(`[Conference] Room ${roomId} closed`);
    } else {
      // Peer Healing: reassign roles if needed
      if (room.subHosts.length < 2) {
        const candidates = [...room.participants].filter(
          (id) => id !== room.hostId && !room.subHosts.includes(id)
        );
        if (candidates.length > 0) {
          const newSubHost = candidates[0];
          room.subHosts.push(newSubHost);
        }
      }

      io.to(roomId).emit('conference_participant_left', {
        userId: socket.userId,
        participants: [...room.participants],
        subHosts: room.subHosts,
        // Peer healing signal
        reconnectNeeded: true,
      });
      console.log(`[Conference] ${socket.userId} left room ${roomId}, healing triggered`);
    }
  });

  // ──────────────────────────────────────────────
  //  KEEP ALIVE PING
  //  Client pings every 3-4 hours to prevent HF sleep
  // ──────────────────────────────────────────────
  socket.on('ping_keepalive', () => {
    socket.emit('pong_keepalive', { ts: Date.now() });
  });

  // ──────────────────────────────────────────────
  //  DISCONNECT
  // ──────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    if (!socket.userId) return;

    onlineUsers.delete(socket.userId);

    // Notify all users this person went offline
    socket.broadcast.emit('user_offline', {
      userId: socket.userId,
      reason,
    });

    // If they were in any conference rooms, handle peer healing
    conferenceRooms.forEach((room, roomId) => {
      if (room.participants.has(socket.userId)) {
        room.participants.delete(socket.userId);
        room.subHosts = room.subHosts.filter((id) => id !== socket.userId);

        if (room.participants.size === 0) {
          conferenceRooms.delete(roomId);
        } else {
          io.to(roomId).emit('conference_participant_left', {
            userId: socket.userId,
            participants: [...room.participants],
            subHosts: room.subHosts,
            reconnectNeeded: true,
          });
        }
      }
    });

    console.log(`[Socket] Disconnected: ${socket.userId} (${reason})`);
  });
});

// ──────────────────────────────────────────────
//  HTTP Endpoints
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
//  AUTH ENDPOINTS
// ──────────────────────────────────────────────

// Register
app.post('/api/register', (req, res) => {
  const { username, displayName, password } = req.body;
  if (!username || !displayName || !password) return res.status(400).json({ error: 'Missing fields' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const users = loadUsers();
  if (users.find(u => u.username === username.toLowerCase().trim())) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const newUser = {
    id: crypto.randomUUID(),
    username: username.toLowerCase().trim(),
    displayName: displayName.trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(users);
  const token = generateToken(newUser.id);
  res.json({ token, user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName } });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const users = loadUsers();
  const user = users.find(u => u.username === username.toLowerCase().trim());
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = generateToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName } });
});

// Get all users (for search, no auth needed — only public info returned)
app.get('/api/users', (req, res) => {
  const { q } = req.query;
  const users = loadUsers();
  const filtered = users
    .filter(u => !q || u.username.includes(q.toLowerCase()) || u.displayName.toLowerCase().includes(q.toLowerCase()))
    .map(u => ({ id: u.id, username: u.username, displayName: u.displayName }));
  res.json({ users: filtered });
});

// Update display name (requires token)
app.put('/api/profile', (req, res) => {
  const auth = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(auth || '');
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === decoded.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const { displayName } = req.body;
  if (displayName) users[idx].displayName = displayName.trim();
  saveUsers(users);
  res.json({ user: { id: users[idx].id, username: users[idx].username, displayName: users[idx].displayName } });
});

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    name: 'Hybrid Engine Signaling Server',
    onlineUsers: onlineUsers.size,
    conferenceRooms: conferenceRooms.size,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// Online users list (for admin/debug)
app.get('/online', (req, res) => {
  const list = [];
  onlineUsers.forEach((info, userId) => {
    list.push({ userId, username: info.username, displayName: info.displayName });
  });
  res.json({ count: list.length, users: list });
});

// Pending message count for a user
app.get('/pending/:userId', (req, res) => {
  const count = offlineBuffer.getPendingCount(req.params.userId);
  res.json({ userId: req.params.userId, pendingCount: count });
});

// ──────────────────────────────────────────────
//  Start Server
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 7860; // HF Space default port
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   🚀 Hybrid Engine Signaling Server           ║
║   Running on port ${PORT}                       ║
║   Zero-cost P2P Chat & Calling               ║
╚══════════════════════════════════════════════╝
  `);
});
