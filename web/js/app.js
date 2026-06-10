// ============================================================
//  Hybrid Engine — Pure Vanilla JS App
//  Custom Auth + Real-time Chat + WebRTC Calling
// ============================================================

const SERVER_URL    = 'https://rifat1670-app-messenger.hf.space';
const GITHUB_OWNER  = 'rifat16700';
const GITHUB_REPO   = 'messenger-habijabi-hybrwoisjdhkdiskjhf';
const GITHUB_BRANCH = 'main';
function githubProfileUrl(userId) {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/profiles/${userId}.json`;
}

// ── 10-Digit UID Generator (no premium/rare patterns) ──
function isPremiumPattern(uid) {
  const str = String(uid);
  if (str.length !== 10) return true;
  if (/^(\d)\1{9}$/.test(str)) return true; // all same
  if ('0123456789'.includes(str) || '9876543210'.includes(str)) return true; // sequential
  if (str.substring(0,5) === str.substring(5,10)) return true; // repeating half
  if (/0{5,}$/.test(str)) return true; // trailing zeros
  const rev = str.split('').reverse().join('');
  if (str === rev) return true; // palindrome
  return false;
}
function generateUID() {
  let uid;
  do {
    const first = Math.floor(Math.random() * 9) + 1;
    const rest  = Array.from({length: 9}, () => Math.floor(Math.random() * 10)).join('');
    uid = `${first}${rest}`;
  } while (isPremiumPattern(uid));
  return uid;
}

// ── Supabase Config ──
const SUPABASE_URL = 'https://spiotvupwogvtxlziezj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwaW90dnVwd29ndnR4bHppZXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3Mjk2MjcsImV4cCI6MjA5NjMwNTYyN30.OAPmD8UfdrU7pjv_KrNQymtjdwb7oK3f1cACQ32kVQc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── State ──
const state = {
  token: null,
  user: null,            // { id, username, displayName, role, bio, avatarColor }
  fcmToken: null,
  socket: null,
  allUsers: [],          // [{ id, username, displayName, role }]
  onlineUserIds: new Set(),
  activeChat: null,      // { id, username, displayName, role }
  messages: {},          // { userId: [{text, from, ts}] }
  sidebarTab: 'all',
  userRoles: {},         // { userId: role } — cached from GitHub profiles

  // WebRTC
  pc: null,
  localStream: null,
  remoteStream: null,
  callPeerId: null,
  callType: 'video',
  callTimerInterval: null,
  callSeconds: 0,
  isMuted: false,
  isCamOff: false,
  pendingOffer: null,    // { from, callerName, callType, offer }
  iceCandidateQueue: [], // For queueing ICE candidates before remote description is set
};

// ── Browser Notifications ──
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showSystemNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  
  // Try Service Worker first (required for Android/mobile)
  // If SW not available or fails, fallback to regular Notification
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        reg.showNotification(title, { body });
      } else {
        new Notification(title, { body });
      }
    }).catch(() => new Notification(title, { body }));
  } else {
    new Notification(title, { body });
  }
}

// ── ICE Servers ──
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// ============================================================
//  INIT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  const savedToken = localStorage.getItem('he_token');
  const savedUser  = localStorage.getItem('he_user');
  if (savedToken && savedUser) {
    state.token = savedToken;
    state.user  = JSON.parse(savedUser);
    requestNotificationPermission();
    showView('main');
    initApp();
  } else {
    showView('auth');
  }

  // Mobile: tap on messages area → dismiss keyboard
  document.getElementById('messages-area')?.addEventListener('click', (e) => {
    if (window.innerWidth <= 700) {
      document.getElementById('msg-input')?.blur();
    }
  });
});


// ============================================================
//  ROUTING — View Switcher
// ============================================================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${name}`);
  if (el) el.classList.add('active');
}

// ============================================================
//  AUTH
// ============================================================
function switchAuthTab(tab) {
  document.getElementById('form-login').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const { data, error } = await supabaseClient
      .from('app_users')
      .select('*')
      .eq('username', username.toLowerCase())
      .single();

    if (error || !data) throw new Error('User not found');
    if (data.password !== password) throw new Error('Invalid password');

    // Generate a simple token for local state
    const token = btoa(data.id + Date.now());
    const user = { id: data.id, username: data.username, displayName: data.display_name };
    onAuthSuccess(token, user);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const displayName = document.getElementById('reg-displayname').value.trim();
  const username    = document.getElementById('reg-username').value.trim();
  const password    = document.getElementById('reg-password').value;
  document.getElementById('err-username').textContent = '';

  const btn = document.getElementById('btn-register');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    // Check if username exists
    const { data: existing } = await supabaseClient
      .from('app_users')
      .select('id')
      .eq('username', username.toLowerCase())
      .single();
      
    if (existing) {
      document.getElementById('err-username').textContent = 'Username already taken';
      return;
    }

    const newUser = {
      id: generateUID(),   // 10-digit numeric UID
      username: username.toLowerCase(),
      display_name: displayName,
      password: password,
    };

    const { error } = await supabaseClient.from('app_users').insert([newUser]);
    if (error) throw new Error(error.message);

    const token = btoa(newUser.id + Date.now());
    const user = { id: newUser.id, username: newUser.username, displayName: newUser.display_name };
    onAuthSuccess(token, user);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

function onAuthSuccess(token, user) {
  state.token = token;
  state.user  = user;
  localStorage.setItem('he_token', token);
  localStorage.setItem('he_user', JSON.stringify(user));

  // Fetch full profile (with role) from GitHub
  fetchMyProfile();

  requestNotificationPermission();
  showView('main');
  initApp();
}

// Fetch our own profile from GitHub (role, bio, etc.)
async function fetchMyProfile() {
  try {
    const r = await fetch(githubProfileUrl(state.user.id), { cache: 'no-cache' });
    if (!r.ok) return;
    const profile = await r.json();
    state.user.role = profile.role || 'user';
    state.user.bio  = profile.bio  || '';
    state.user.avatarColor = profile.avatarColor || '';
    localStorage.setItem('he_user', JSON.stringify(state.user));
    // Update sidebar avatar indicator for moderator
    updateMyRoleUI();
  } catch (e) { /* GitHub not yet available */ }
}

function updateMyRoleUI() {
  const roleEl = document.getElementById('my-role-badge');
  if (!roleEl) return;
  if (state.user?.role === 'moderator') {
    roleEl.style.display = 'inline-flex';
    roleEl.title = 'Moderator';
  } else if (state.user?.role === 'admin') {
    roleEl.style.display = 'inline-flex';
    roleEl.title = 'Admin';
  } else {
    roleEl.style.display = 'none';
  }
}

function logout() {
  if (state.socket) state.socket.disconnect();
  state.socket = null;
  state.user   = null;
  state.token  = null;
  localStorage.removeItem('he_token');
  localStorage.removeItem('he_user');
  showView('auth');
}

// ============================================================
//  APP INIT
// ============================================================
function initApp() {
  // Update UI with my info
  document.getElementById('my-displayname').textContent = state.user.displayName;
  document.getElementById('my-username').textContent    = `@${state.user.username}`;
  document.getElementById('my-avatar').textContent      = initials(state.user.displayName);

  // Load local messages and users, init Firebase, then connect socket
  loadMessagesLocally().then(() => {
    fetchUsers().then(() => {
      initFirebase().then(() => connectSocket());
    });
  });
}

// ============================================================
//  FIREBASE CLOUD MESSAGING
// ============================================================
async function initFirebase() {
  if (typeof firebase === 'undefined') return;

  try {
    firebase.initializeApp({
      apiKey: "AIzaSyB8qqxWLZmnHyawkU1_8ENvhhXOkBgpDwA",
      authDomain: "linko-14235.firebaseapp.com",
      projectId: "linko-14235",
      storageBucket: "linko-14235.firebasestorage.app",
      messagingSenderId: "951577535380",
      appId: "1:951577535380:web:cc14d761d91f098f30e581"
    });

    const messaging = firebase.messaging();
    // Request permission implicitly while getting token
    const token = await messaging.getToken({ 
      vapidKey: 'BGIT6t06PoNAASm2V8F7pdNgCMxYxWK6FcfSaW7kgo3pqx2yUfeWIo0kVjEEUrsygQ625Ta8eCSeqD1S0G3ZsoM' 
    });
    
    if (token) {
      console.log('[FCM] Token acquired:', token.slice(0, 15) + '...');
      state.fcmToken = token;
      // Save FCM token to Supabase
      if (state.user?.id) {
        supabaseClient.from('app_users').update({ fcm_token: token }).eq('id', state.user.id).then(({ error }) => {
          if (error) console.error('Failed to save FCM token to Supabase:', error);
        });
      }
    }

    messaging.onMessage((payload) => {
      console.log('[FCM] Foreground push:', payload);
      // We rely on socket for real-time updates anyway, so we just log this.
    });
  } catch (err) {
    console.warn('[FCM] Failed to initialize:', err);
  }
}

// ============================================================
//  STORAGE (IndexedDB via localforage)
// ============================================================
async function loadMessagesLocally() {
  try {
    const msgs = await localforage.getItem(`msgs_${state.user.id}`);
    if (msgs) state.messages = msgs;
  } catch (e) { console.error('Error loading local messages:', e); }
}

async function saveMessagesLocally() {
  try {
    await localforage.setItem(`msgs_${state.user.id}`, state.messages);
  } catch (e) { console.error('Error saving local messages:', e); }
}

// ============================================================
//  USER LIST
// ============================================================
async function fetchUsers() {
  try {
    const { data, error } = await supabaseClient
      .from('app_users')
      .select('id, username, display_name');
      
    if (error) throw error;
    
    state.allUsers = (data || [])
      .filter(u => u.id !== state.user.id)
      .map(u => ({ id: u.id, username: u.username, displayName: u.display_name }));
      
    // Async load roles from GitHub
    state.allUsers.forEach(u => {
      fetch(githubProfileUrl(u.id), { cache: 'no-cache' })
        .then(r => r.json())
        .then(profile => {
          state.userRoles[u.id] = profile.role || 'user';
          if (state.activeChat?.id === u.id) updateChatRoleUI(u.id);
          renderUserList();
        })
        .catch(() => {});
    });

    renderUserList();
  } catch (e) {
    console.error('fetchUsers:', e);
  }
}

function updateChatRoleUI(userId) {
  const role = state.userRoles[userId] || state.allUsers.find(u => u.id === userId)?.role || 'user';
  document.getElementById('chat-role-badge').innerHTML = roleBadgeHTML(role);
}

// SVG badges for roles
const MODERATOR_BADGE = `<span class="role-badge mod" title="Moderator">
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
</span>`;
const ADMIN_BADGE = `<span class="role-badge admin" title="Admin">
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
</span>`;

function roleBadgeHTML(role) {
  if (role === 'moderator') return MODERATOR_BADGE;
  if (role === 'admin') return ADMIN_BADGE;
  return '';
}

function renderUserList() {
  const tab    = state.sidebarTab;
  const query  = document.getElementById('search-input').value.toLowerCase();
  const list   = document.getElementById('user-list');

  let users = state.allUsers;
  if (tab === 'online') users = users.filter(u => state.onlineUserIds.has(u.id));
  if (query) users = users.filter(u =>
    u.username.includes(query) || u.displayName.toLowerCase().includes(query)
  );

  if (!users.length) {
    list.innerHTML = `<div class="no-chats"><div class="icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>${query ? 'No results found.' : 'No users yet.'}</p></div>`;
    return;
  }

  list.innerHTML = users.map(u => {
    const isOnline = state.onlineUserIds.has(u.id);
    const isActive = state.activeChat?.id === u.id;
    const role     = state.userRoles[u.id] || u.role || 'user';
    return `
      <div class="user-item ${isActive ? 'active' : ''}" onclick="openChat('${u.id}')">
        <div class="avatar sm">${initials(u.displayName)}${isOnline ? '<div class="online-dot"></div>' : ''}</div>
        <div class="user-item-info">
          <div class="user-item-name">${esc(u.displayName)} ${roleBadgeHTML(role)}</div>
          <div class="user-item-sub">@${esc(u.username)} · ${isOnline ? '<span style="color:var(--online)">Online</span>' : 'Offline'}</div>
        </div>
      </div>`;
  }).join('');
}

function onSearch(q) { renderUserList(); }

function switchSidebarTab(tab) {
  state.sidebarTab = tab;
  document.getElementById('stab-all').classList.toggle('active',    tab === 'all');
  document.getElementById('stab-online').classList.toggle('active', tab === 'online');
  renderUserList();
}

function focusSearch() { document.getElementById('search-input').focus(); }

// ============================================================
//  CHAT
// ============================================================
function openChat(userId) {
  const user = state.allUsers.find(u => u.id === userId);
  if (!user) return;

  state.activeChat = user;
  if (!state.messages[userId]) state.messages[userId] = [];

  // Update header
  document.getElementById('chat-avatar').textContent = initials(user.displayName);
  document.getElementById('chat-name').textContent   = user.displayName;
  updateChatRoleUI(userId);
  updateChatStatus(userId);

  // Moderator Action Button Visibility
  const modBtn = document.getElementById('btn-mod-action');
  if (modBtn) {
    if (state.user?.role === 'moderator' || state.user?.role === 'admin') {
      modBtn.style.display = 'inline-flex';
    } else {
      modBtn.style.display = 'none';
    }
  }

  // Show chat panel
  document.getElementById('chat-empty').style.display  = 'none';
  document.getElementById('active-chat').style.display = 'flex';

  renderMessages();
  renderUserList();

  // Mobile: hide sidebar
  if (window.innerWidth <= 700) {
    document.getElementById('sidebar').classList.add('hidden');
    // Don't auto-focus on mobile — user taps input to open keyboard
  } else {
    document.getElementById('msg-input').focus();
  }
}

function closeChat() {
  document.getElementById('active-chat').style.display = 'none';
  document.getElementById('chat-empty').style.display  = 'flex';
  state.activeChat = null;
  
  if (window.innerWidth <= 700) {
    document.getElementById('sidebar').classList.remove('hidden');
  }
}

async function openPublicProfile() {
  if (!state.activeChat) return;
  const user = state.activeChat;

  // Set basics immediately
  document.getElementById('pp-name').textContent     = user.displayName;
  document.getElementById('pp-username').textContent = `@${user.username}`;
  document.getElementById('pp-uid').textContent      = user.id;
  document.getElementById('pp-avatar-letter').textContent = initials(user.displayName);
  document.getElementById('pp-avatar').style.display       = 'none';
  document.getElementById('pp-avatar-letter').style.display = 'flex';
  document.getElementById('pp-bio').textContent      = 'Loading…';
  document.getElementById('pp-phone').textContent    = '-';
  document.getElementById('pp-email').textContent    = '-';
  document.getElementById('pp-location').textContent = '-';
  document.getElementById('pp-website').textContent  = '-';

  document.getElementById('modal-public-profile').classList.add('show');

  // Fetch full profile from GitHub
  try {
    const r = await fetch(githubProfileUrl(user.id), { cache: 'no-cache' });
    if (r.ok) {
      const p = await r.json();
      document.getElementById('pp-bio').textContent      = p.bio || 'No bio provided.';
      document.getElementById('pp-phone').textContent    = p.phone || '-';
      document.getElementById('pp-email').textContent    = p.email || '-';
      document.getElementById('pp-location').textContent = p.location || '-';
      if (p.website) {
        document.getElementById('pp-website').innerHTML = `<a href="${esc(p.website)}" target="_blank" style="color:var(--primary)">${esc(p.website)}</a>`;
      } else {
        document.getElementById('pp-website').textContent = '-';
      }
      if (p.avatarUrl) {
        document.getElementById('pp-avatar').src = p.avatarUrl;
        document.getElementById('pp-avatar').style.display = 'flex';
        document.getElementById('pp-avatar-letter').style.display = 'none';
      } else if (p.avatarColor) {
        document.getElementById('pp-avatar-letter').style.background = p.avatarColor;
      }
    } else {
      document.getElementById('pp-bio').textContent = 'No profile info yet.';
    }
  } catch (e) {
    document.getElementById('pp-bio').textContent = 'Could not load profile.';
  }
}

function updateChatStatus(userId) {
  const isOnline = state.onlineUserIds.has(userId || state.activeChat?.id);
  const el = document.getElementById('chat-status');
  if (el) el.innerHTML = isOnline
    ? '<span style="color:var(--online)">● Online</span>'
    : '<span style="color:var(--text3)">● Offline</span>';
}

function renderMessages() {
  const area = document.getElementById('messages-area');
  const msgs = state.messages[state.activeChat?.id] || [];

  if (!msgs.length) {
    area.innerHTML = '<div class="msg-date-divider">No messages yet. Say hello! 👋</div>';
    return;
  }

  area.innerHTML = msgs.map(m => {
    if (m.type === 'sys') {
      return `<div class="msg-sys-container"><div class="msg-sys">${esc(m.text)}</div></div>`;
    }

    const isMe = m.from === state.user.id;
    // Basic markdown parser for links: [text](url)
    const formattedText = esc(m.text).replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="msg-link">$1</a>');
    
    return `
      <div class="msg-row ${isMe ? 'me' : ''}">
        <div class="msg-bubble ${isMe ? 'me' : 'them'}">
          ${formattedText}
          <div class="msg-time">${formatTime(m.ts)}</div>
        </div>
      </div>`;
  }).join('');

  area.scrollTop = area.scrollHeight;
}

function onMsgKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text || !state.activeChat) return;

  const msg = { text, from: state.user.id, ts: new Date().toISOString() };
  if (!state.messages[state.activeChat.id]) state.messages[state.activeChat.id] = [];
  state.messages[state.activeChat.id].push(msg);
  saveMessagesLocally();
  renderMessages();
  input.value = '';
  // Keep keyboard open on mobile after sending
  input.focus();

  // Send via socket
  if (state.socket) {
    state.socket.emit('send_message', {
      to: state.activeChat.id,
      message: { text, type: 'text' },
      originalTimestamp: msg.ts,
    });
  }
}

// ============================================================
//  FILE TRANSFER — Direct via Socket (No external service)
//  Chunked transfer: কোনো size limit নেই, শুধু device/HF disk limit
// ============================================================

const FILE_CHUNK_SIZE = 256 * 1024; // 256 KB per chunk

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file || !state.activeChat) return;
  event.target.value = '';

  if (!state.socket?.connected) {
    toast('Not connected to server', 'error');
    return;
  }

  const isReceiverOnline = state.onlineUserIds.has(state.activeChat.id);
  const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);
  const transferId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ts = new Date().toISOString();

  toast(`Sending ${file.name} (${formatFileSize(file.size)})…`, 'info');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * FILE_CHUNK_SIZE;
      const end   = Math.min(start + FILE_CHUNK_SIZE, file.size);
      const chunk = uint8.slice(start, end);
      const base64Chunk = btoa(String.fromCharCode(...chunk));

      state.socket.emit('file_chunk', {
        to: state.activeChat.id,
        transferId,
        chunkIndex: i,
        totalChunks,
        base64Chunk,
        filename: file.name,
        mimetype: file.type || 'application/octet-stream',
        fileSize: file.size,
        senderId: state.user.id,
        senderName: state.user.displayName,
        originalTimestamp: ts,
        isLastChunk: i === totalChunks - 1,
      });

      // Small delay to avoid flooding socket
      if (i < totalChunks - 1) await sleep(20);
    }

    // Show in our own chat
    const previewText = isImage(file.type)
      ? `[Image: ${file.name}]`
      : `[File: ${file.name} · ${formatFileSize(file.size)}]`;

    const msg = {
      text: previewText,
      from: state.user.id,
      ts,
      fileTransfer: true,
      filename: file.name,
      mimetype: file.type,
      fileSize: file.size,
    };
    if (!state.messages[state.activeChat.id]) state.messages[state.activeChat.id] = [];
    state.messages[state.activeChat.id].push(msg);
    saveMessagesLocally();
    renderMessages();

    toast(`${file.name} sent!`, 'success');
  } catch (e) {
    toast('File send failed: ' + e.message, 'error');
    console.error('[FileTransfer]', e);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function isImage(mimetype) {
  return mimetype && mimetype.startsWith('image/');
}

// Incoming file chunks (receiver side)
const _fileChunkBuffers = {}; // transferId → { chunks, meta }

function handleIncomingFileChunk({ transferId, chunkIndex, totalChunks, base64Chunk,
  filename, mimetype, fileSize, senderId, senderName, originalTimestamp }) {

  if (!_fileChunkBuffers[transferId]) {
    _fileChunkBuffers[transferId] = {
      chunks: new Array(totalChunks),
      meta: { filename, mimetype, fileSize, senderId, senderName, originalTimestamp },
      received: 0,
    };
  }

  const buf = _fileChunkBuffers[transferId];
  buf.chunks[chunkIndex] = base64Chunk;
  buf.received++;

  if (buf.received === totalChunks) {
    // All chunks received — combine and offer download
    const fullBase64 = buf.chunks.join('');
    delete _fileChunkBuffers[transferId];
    deliverReceivedFile(fullBase64, buf.meta, senderId);
  }
}

function deliverReceivedFile(base64Data, { filename, mimetype, fileSize, senderId, senderName, originalTimestamp }) {
  // Save to chat history
  if (!state.messages[senderId]) state.messages[senderId] = [];
  const msg = {
    text: isImage(mimetype) ? `[Image: ${filename}]` : `[File: ${filename} · ${formatFileSize(fileSize)}]`,
    from: senderId,
    ts: originalTimestamp,
    fileTransfer: true,
    filename,
    mimetype,
    fileSize,
    base64Data, // kept in memory for download
  };
  state.messages[senderId].push(msg);
  saveMessagesLocally();

  if (state.activeChat?.id === senderId) {
    renderMessages();
    if (document.hidden) showSystemNotification(`File from ${senderName}`, filename);
  } else {
    toast(`File from ${getUserName(senderId)}: ${filename}`, 'info');
    showSystemNotification(`File from ${senderName}`, filename);
  }

  // Auto-trigger download for the received file
  downloadBase64File(base64Data, filename, mimetype);
}

function downloadBase64File(base64, filename, mimetype) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimetype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}


// ============================================================
//  SOCKET.IO
// ============================================================
function connectSocket() {
  if (state.socket) state.socket.disconnect();

  state.socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  });

  state.socket.on('connect', () => {
    console.log('[Socket] Connected:', state.socket.id);
    state.socket.emit('register', {
      userId:      state.user.id,
      username:    state.user.username,
      displayName: state.user.displayName,
      fcmToken:    state.fcmToken
    });
  });

  state.socket.on('online_users_list', (list) => {
    state.onlineUserIds.clear();
    list.forEach(u => state.onlineUserIds.add(u.userId));
    renderUserList();
    updateChatStatus();
  });

  state.socket.on('role_updated', ({ role }) => {
    toast(`Your role has been updated to ${role}`, 'info');
    state.user.role = role;
    localStorage.setItem('he_user', JSON.stringify(state.user));
    updateMyRoleUI();
    // Refresh user list logic to reflect new moderator powers
    if (state.activeChat) openChat(state.activeChat.id);
  });

  state.socket.on('user_online', ({ userId }) => {
    state.onlineUserIds.add(userId);
    // If this user wasn't in our list, refresh
    if (!state.allUsers.find(u => u.id === userId)) fetchUsers();
    renderUserList();
    updateChatStatus();
  });

  state.socket.on('user_offline', ({ userId }) => {
    state.onlineUserIds.delete(userId);
    renderUserList();
    updateChatStatus();
  });

  state.socket.on('new_message', ({ from, message, originalTimestamp }) => {
    if (!state.messages[from]) state.messages[from] = [];
    state.messages[from].push({ text: message.text, from, ts: originalTimestamp });
    saveMessagesLocally();
    if (state.activeChat?.id === from) {
      renderMessages();
      if (document.hidden) {
        showSystemNotification(`New message from ${getUserName(from)}`, message.text);
      }
    } else {
      toast(`New message from ${getUserName(from)}`, 'info');
      showSystemNotification(`New message from ${getUserName(from)}`, message.text);
    }
  });

  state.socket.on('offline_message_delivered', ({ senderId, senderName, originalTimestamp, data }) => {
    if (!data?.text) return;
    if (!state.messages[senderId]) state.messages[senderId] = [];

    // Avoid duplicate (if message already locally stored)
    const ts = originalTimestamp || new Date().toISOString();
    const alreadyExists = state.messages[senderId].some(m => m.ts === ts && m.from === senderId);
    if (!alreadyExists) {
      state.messages[senderId].push({ text: data.text, from: senderId, ts });
      saveMessagesLocally();

      if (state.activeChat?.id === senderId) {
        renderMessages();
      } else {
        // Notify user that a buffered message just arrived
        toast(`📬 Message from ${senderName || getUserName(senderId)}`, 'info');
        showSystemNotification(`New message`, `From ${senderName || getUserName(senderId)}: ${data.text.slice(0,60)}`);
        renderUserList(); // unread badge update
      }
    }
  });

  // ── INCOMING FILE CHUNK (online P2P file transfer) ──
  state.socket.on('file_chunk', (chunkData) => {
    handleIncomingFileChunk(chunkData);
  });

  // ── OFFLINE FILE DELIVERED (receiver came online, server sends buffered file) ──
  state.socket.on('offline_file_delivered', ({ senderId, senderName, data, originalTimestamp }) => {
    if (data?.buffer) {
      deliverReceivedFile(data.buffer, {
        filename: data.filename,
        mimetype: data.mimetype,
        fileSize: data.sizeBytes || 0,
        senderId,
        senderName,
        originalTimestamp,
      });
    }
  });

  // ── INCOMING CALL ──
  state.socket.on('incoming_call', ({ from, callerName, callType, offer }) => {
    console.log(`[Call] Incoming ${callType} call from ${callerName}`);
    state.pendingOffer = { from, callerName, callType, offer };
    showIncomingCallModal(callerName, callType);
    showSystemNotification(`Incoming ${callType} call`, `From ${callerName}`);
    
    const ringtone = document.getElementById('ringtone');
    if (ringtone) {
      ringtone.currentTime = 0;
      ringtone.play().catch(e => console.log('Audio autoplay blocked:', e));
    }
  });

  state.socket.on('call_answered', async ({ from, answer }) => {
    if (state.pc) {
      try {
        await state.pc.setRemoteDescription(new RTCSessionDescription(answer));
        
        // Process queued candidates
        for (const c of state.iceCandidateQueue) {
          try { await state.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
        }
        state.iceCandidateQueue = [];
        
        startCallTimer();
        document.getElementById('call-status-text').textContent = 'Connected';
        document.getElementById('call-timer').style.display = '';
      } catch (e) { console.error('setRemoteDescription:', e); }
    }
  });

  state.socket.on('ice_candidate', async ({ from, candidate }) => {
    if (candidate) {
      if (state.pc && state.pc.remoteDescription) {
        try { await state.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { /* ignore */ }
      } else {
        state.iceCandidateQueue.push(candidate);
      }
    }
  });

  state.socket.on('call_rejected', () => {
    logSystemMessage(`📞 Call Declined`, state.callPeerId);
    toast('Call declined', 'info');
    cleanupCall();
  });

  state.socket.on('call_ended', () => {
    logSystemMessage(`📞 Call Ended (${formatDuration(state.callSeconds)})`, state.callPeerId);
    toast('Call ended', 'info');
    cleanupCall();
  });

  state.socket.on('call_failed', ({ reason }) => {
    logSystemMessage(`📞 Call Failed`, state.callPeerId);
    toast(reason === 'user_offline' ? 'User is offline' : 'Call failed', 'error');
    cleanupCall();
  });

  state.socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });
}

// ============================================================
//  WEBRTC — CALLING
// ============================================================
async function startCall(callType) {
  if (!state.activeChat) return;
  state.callPeerId = state.activeChat.id;
  state.callType   = callType;

  showView('call');
  document.getElementById('call-peer-name').textContent   = state.activeChat.displayName;
  document.getElementById('call-status-text').textContent = 'Calling…';
  document.getElementById('call-timer').style.display     = 'none';

  // Hide cam button for audio calls
  document.getElementById('btn-cam').style.display = callType === 'audio' ? 'none' : '';

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { facingMode: 'user', width: 1280, height: 720 } : false,
    });
    document.getElementById('local-video').srcObject = state.localStream;

    state.pc = createPC();
    state.localStream.getTracks().forEach(t => state.pc.addTrack(t, state.localStream));

    const offer = await state.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: callType === 'video' });
    await state.pc.setLocalDescription(offer);

    // Fetch target FCM token from Supabase for offline push notification
    const { data: peerData } = await supabaseClient.from('app_users').select('fcm_token').eq('id', state.callPeerId).single();
    const targetFcmToken = peerData?.fcm_token || null;

    state.socket.emit('offer', { to: state.callPeerId, offer, callType, targetFcmToken });
    document.getElementById('call-status-text').textContent = 'Ringing…';
  } catch (e) {
    toast('Could not access camera/microphone: ' + e.message, 'error');
    cleanupCall();
  }
}

function showIncomingCallModal(callerName, callType) {
  document.getElementById('incoming-avatar').textContent = initials(callerName);
  document.getElementById('incoming-name').textContent   = callerName;
  document.getElementById('incoming-type').textContent   = callType === 'video' ? 'Incoming Video Call' : 'Incoming Audio Call';
  document.getElementById('modal-incoming-call').classList.add('show');
}

async function acceptCall() {
  closeModal('modal-incoming-call');
  // Stop ringtone immediately
  const ringtone = document.getElementById('ringtone');
  if (ringtone) { ringtone.pause(); ringtone.currentTime = 0; }
  if (!state.pendingOffer) return;

  const { from, callerName, callType, offer } = state.pendingOffer;
  logSystemMessage(`📞 Incoming ${callType} call accepted`, from);
  state.callPeerId = from;
  state.callType   = callType;
  state.pendingOffer = null;

  showView('call');
  document.getElementById('call-peer-name').textContent   = callerName;
  document.getElementById('call-status-text').textContent = 'Connecting…';
  document.getElementById('call-timer').style.display     = 'none';
  document.getElementById('btn-cam').style.display        = callType === 'audio' ? 'none' : '';

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { facingMode: 'user' } : false,
    });
    document.getElementById('local-video').srcObject = state.localStream;

    state.pc = createPC();
    state.localStream.getTracks().forEach(t => state.pc.addTrack(t, state.localStream));

    await state.pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Process queued candidates
    for (const c of state.iceCandidateQueue) {
      try { await state.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
    }
    state.iceCandidateQueue = [];

    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);

    state.socket.emit('answer', { to: from, answer });
    startCallTimer();
    document.getElementById('call-status-text').textContent = 'Connected';
    document.getElementById('call-timer').style.display = '';
  } catch (e) {
    toast('Could not start call: ' + e.message, 'error');
    cleanupCall();
  }
}

function rejectCall() {
  closeModal('modal-incoming-call');
  // Stop ringtone
  const ringtone = document.getElementById('ringtone');
  if (ringtone) { ringtone.pause(); ringtone.currentTime = 0; }
  if (state.pendingOffer) {
    logSystemMessage(`📞 Missed Call`, state.pendingOffer.from);
    state.socket.emit('call_rejected', { to: state.pendingOffer.from });
    state.pendingOffer = null;
  }
}

function createPC() {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) state.socket.emit('ice_candidate', { to: state.callPeerId, candidate });
  };

  pc.ontrack = (event) => {
    const remoteVideo = document.getElementById('remote-video');
    if (event.streams?.[0]) remoteVideo.srcObject = event.streams[0];
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') pc.restartIce();
  };

  return pc;
}

function endCall() {
  if (state.callPeerId) {
    logSystemMessage(`📞 Call Ended (${formatDuration(state.callSeconds)})`, state.callPeerId);
    state.socket.emit('call_ended', { to: state.callPeerId });
  }
  cleanupCall();
}

function cleanupCall() {
  if (state.callTimerInterval) clearInterval(state.callTimerInterval);
  state.callTimerInterval = null;
  state.callSeconds       = 0;

  // Always stop ringtone
  const ringtone = document.getElementById('ringtone');
  if (ringtone) { ringtone.pause(); ringtone.currentTime = 0; }

  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
  }
  if (state.pc) { state.pc.close(); state.pc = null; }

  state.iceCandidateQueue = [];
  document.getElementById('local-video').srcObject  = null;
  document.getElementById('remote-video').srcObject = null;
  state.callPeerId = null;
  state.isMuted    = false;
  state.isCamOff   = false;

  showView('main');
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  state.localStream?.getAudioTracks().forEach(t => { t.enabled = !state.isMuted; });
  document.getElementById('btn-mute').classList.toggle('active', state.isMuted);
  document.getElementById('mute-label').textContent = state.isMuted ? 'Unmute' : 'Mute';
}

function toggleCamera() {
  state.isCamOff = !state.isCamOff;
  state.localStream?.getVideoTracks().forEach(t => { t.enabled = !state.isCamOff; });
  document.getElementById('btn-cam').classList.toggle('active', state.isCamOff);
  document.getElementById('cam-label').textContent = state.isCamOff ? 'Show Cam' : 'Camera';
}

function startCallTimer() {
  state.callSeconds = 0;
  state.callTimerInterval = setInterval(() => {
    state.callSeconds++;
    const m = Math.floor(state.callSeconds / 60);
    const s = String(state.callSeconds % 60).padStart(2, '0');
    document.getElementById('call-timer').textContent = `${m}:${s}`;
  }, 1000);
}

// ============================================================
//  PROFILE / SETTINGS PAGE
// ============================================================
function showSettings() {
  // Populate fields from state
  document.getElementById('profile-displayname').value = state.user.displayName || '';
  document.getElementById('profile-bio').value         = state.user.bio || '';
  document.getElementById('profile-phone').value       = state.user.phone || '';
  document.getElementById('profile-email').value       = state.user.email || '';
  document.getElementById('profile-location').value    = state.user.location || '';
  document.getElementById('profile-website').value     = state.user.website || '';
  document.getElementById('profile-avatar-preview').textContent = initials(state.user.displayName);
  document.getElementById('settings-my-name').textContent      = state.user.displayName || '';
  document.getElementById('settings-my-username').textContent  = `@${state.user.username || ''}`;
  document.getElementById('settings-my-uid').textContent       = state.user.id || '';
  
  // Account section
  document.getElementById('account-email-display').textContent = state.user.email || state.user.username || '—';
  document.getElementById('account-role-display').textContent  = state.user.role || 'user';

  // Sync theme toggle with current theme
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const toggleCheck = document.getElementById('theme-toggle-check');
  if (toggleCheck) toggleCheck.checked = isLight;
  const themeLabel = document.getElementById('theme-label');
  if (themeLabel) themeLabel.textContent = isLight ? 'Light Mode' : 'Dark Mode';

  showView('settings');
}

function hideSettings() {
  showView('main');
}

async function saveProfile() {
  const displayName = document.getElementById('profile-displayname').value.trim();
  const bio         = document.getElementById('profile-bio').value.trim();
  const phone       = document.getElementById('profile-phone').value.trim();
  const email       = document.getElementById('profile-email').value.trim();
  const location    = document.getElementById('profile-location').value.trim();
  const website     = document.getElementById('profile-website').value.trim();
  if (!displayName) { toast('Display name is required', 'error'); return; }

  const btn = document.getElementById('btn-save-profile');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await fetch(`${SERVER_URL}/api/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.user.id
      },
      body: JSON.stringify({ displayName, bio, phone, email, location, website, username: state.user.username })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server error ${res.status}`);
    }

    const { user } = await res.json();

    // Update local state with all fields
    Object.assign(state.user, { displayName, bio, phone, email, location, website });
    localStorage.setItem('he_user', JSON.stringify(state.user));

    // Update sidebar avatar & name
    document.getElementById('my-displayname').textContent = displayName;
    document.getElementById('my-avatar').textContent      = initials(displayName);
    document.getElementById('settings-my-name').textContent = displayName;

    toast('Profile saved!', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
  }
}

// ============================================================
//  MODALS
// ============================================================
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// Close modal by clicking overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ============================================================
//  UTILITIES
// ============================================================
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function getUserName(userId) {
  return state.allUsers.find(u => u.id === userId)?.displayName || 'Someone';
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function formatTime(isoString) {
  const d = new Date(isoString);
  let h = d.getHours(), m = d.getMinutes();
  h = h < 10 ? '0'+h : h;
  m = m < 10 ? '0'+m : m;
  return `${h}:${m}`;
}

function toggleTheme(isLight) {
  // Can be called from checkbox (bool) or button (no args)
  if (typeof isLight !== 'boolean') {
    isLight = document.documentElement.getAttribute('data-theme') !== 'light';
  }
  if (isLight) {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('he_theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('he_theme', 'dark');
  }
  // Update label in settings if open
  const themeLabel = document.getElementById('theme-label');
  if (themeLabel) themeLabel.textContent = isLight ? 'Light Mode' : 'Dark Mode';
}

// Load saved theme on boot
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('he_theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
});

function formatDuration(seconds) {
  if (!seconds) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function logSystemMessage(text, userId) {
  if (!userId) return;
  const msg = { text, from: state.user.id, type: 'sys', ts: new Date().toISOString() };
  if (!state.messages[userId]) state.messages[userId] = [];
  state.messages[userId].push(msg);
  saveMessagesLocally();
  if (state.activeChat?.id === userId) renderMessages();
}

function togglePwd(inputId, btn) {
  const input = document.getElementById(inputId);
  const show  = input.type === 'password';
  input.type  = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁️';
}

// ── Toast ──
function toast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
