const fs = require('fs');
const axios = require('axios');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER || 'rifat16700';
const GITHUB_REPO = process.env.GITHUB_REPO_NAME || 'messenger-habijabi-hybrwoisjdhkdiskjhf';
const BRANCH = 'main';

// ── Generic GitHub file read/write ──
async function ghGet(path) {
  const res = await axios.get(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
  );
  return res.data; // { sha, content (base64) }
}

async function ghPut(path, content, message, sha = null) {
  const payload = {
    message,
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content, null, 2)).toString('base64'),
    branch: BRANCH,
  };
  if (sha) payload.sha = sha;
  await axios.put(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    payload,
    { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
  );
}

// ── Registry (full user list backup — restores users.json after HF restart) ──
// Path: database/_registry.json
// Contains all users including passwordHash (hashes are one-way, not reversible)
const REGISTRY_PATH = 'database/_registry.json';

async function saveRegistry(users) {
  if (!GITHUB_TOKEN) return;
  try {
    let sha = null;
    try { sha = (await ghGet(REGISTRY_PATH)).sha; } catch (e) { /* new file */ }
    await ghPut(REGISTRY_PATH, users, `Registry sync — ${users.length} users [skip ci]`, sha);
    console.log(`[GitHub] Registry synced (${users.length} users)`);
  } catch (err) {
    console.error('[GitHub] Registry sync failed:', err.message);
  }
}

async function loadRegistry() {
  if (!GITHUB_TOKEN) return [];
  try {
    const data = await ghGet(REGISTRY_PATH);
    const decoded = Buffer.from(data.content, 'base64').toString('utf8');
    const users = JSON.parse(decoded);
    console.log(`[GitHub] Registry loaded — ${users.length} users`);
    return users;
  } catch (err) {
    if (err.response && err.response.status === 404) return []; // Not yet created
    console.error('[GitHub] Registry load failed:', err.message);
    return [];
  }
}

// ── Per-user Public Profile Sync ──
// Path: database/profiles/{uid}.json (public — no passwordHash)
async function saveProfile(userId, profileData) {
  if (!GITHUB_TOKEN) return;
  const path = `database/profiles/${userId}.json`;
  try {
    let sha = null;
    try { sha = (await ghGet(path)).sha; } catch (e) { /* new file */ }
    await ghPut(path, profileData, `Update profile for ${userId} [skip ci]`, sha);
    console.log(`[GitHub] Profile synced for ${userId}`);
  } catch (error) {
    console.error(`[GitHub] Profile sync failed for ${userId}:`, error.message);
  }
}

async function deleteProfile(userId) {
  if (!GITHUB_TOKEN) return;
  const path = `database/profiles/${userId}.json`;
  try {
    const data = await ghGet(path);
    await axios.delete(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      {
        headers: { Authorization: `token ${GITHUB_TOKEN}` },
        data: { message: `Delete profile for ${userId} [skip ci]`, sha: data.sha, branch: BRANCH }
      }
    );
    console.log(`[GitHub] Deleted profile ${userId}`);
  } catch (error) {
    console.error(`[GitHub] Failed to delete profile ${userId}:`, error.message);
  }
}

// ── Batch Sync for Offline Messages ──
// Random interval: 5-10 mins if >5 items, else 30 mins.
let offlineMessageQueue = [];
let syncTimer = null;

function queueOfflineMessageSync(receiverId, messageData) {
  offlineMessageQueue.push({ receiverId, messageData, timestamp: Date.now() });
  console.log(`[GitHub Queue] Added offline message for ${receiverId}. Queue: ${offlineMessageQueue.length}`);
  scheduleNextSync();
}

function scheduleNextSync() {
  if (syncTimer) return;
  if (offlineMessageQueue.length === 0) return;

  let delayMs;
  if (offlineMessageQueue.length > 5) {
    const minMs = 5 * 60 * 1000;
    const maxMs = 10 * 60 * 1000;
    delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  } else {
    delayMs = 30 * 60 * 1000;
  }

  console.log(`[GitHub Queue] Scheduled batch sync in ${Math.round(delayMs / 60000)} minutes.`);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    executeBatchSync();
  }, delayMs);
}

async function executeBatchSync() {
  if (!GITHUB_TOKEN || offlineMessageQueue.length === 0) return;

  const batchToSync = [...offlineMessageQueue];
  offlineMessageQueue = [];

  console.log(`[GitHub Batch] Syncing ${batchToSync.length} offline messages.`);
  const path = `database/offline_batches/batch_${Date.now()}.json`;

  try {
    await ghPut(path, batchToSync, `Batch sync of ${batchToSync.length} offline messages [skip ci]`);
    console.log(`[GitHub Batch] Synced to ${path}`);
  } catch (error) {
    console.error(`[GitHub Batch] Sync failed:`, error.message);
    offlineMessageQueue = [...batchToSync, ...offlineMessageQueue];
    scheduleNextSync();
  }
}

module.exports = {
  saveProfile,
  saveRegistry,
  loadRegistry,
  deleteProfile,
  queueOfflineMessageSync,
};