const fs = require('fs');
const axios = require('axios');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER || 'rifat16700';
const GITHUB_REPO = process.env.GITHUB_REPO_NAME || 'messenger-habijabi-hybrwoisjdhkdiskjhf';
const BRANCH = 'main';

// ── Instant Profile Sync ──
// Triggered when user profile data updates.
async function saveProfile(userId, profileData) {
  if (!GITHUB_TOKEN) return;
  const path = `database/users/${userId}.json`;
  try {
    let sha = null;
    // Check if file exists to get SHA
    try {
      const res = await axios.get(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });
      sha = res.data.sha;
    } catch (e) {
      if (e.response && e.response.status !== 404) throw e;
    }

    const payload = {
      message: `Update profile for ${userId}`,
      content: Buffer.from(JSON.stringify(profileData)).toString('base64'),
      branch: BRANCH
    };
    if (sha) payload.sha = sha;

    await axios.put(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, payload, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    console.log(`[GitHub] Instant sync complete for profile ${userId}`);
  } catch (error) {
    console.error(`[GitHub] Failed to sync profile ${userId}:`, error.message);
  }
}

async function deleteProfile(userId) {
  if (!GITHUB_TOKEN) return;
  const path = `database/users/${userId}.json`;
  try {
    const res = await axios.get(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    const sha = res.data.sha;

    await axios.delete(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` },
      data: {
        message: `Delete profile for ${userId}`,
        sha,
        branch: BRANCH
      }
    });
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
  console.log(`[GitHub Queue] Added offline message for ${receiverId}. Queue length: ${offlineMessageQueue.length}`);
  scheduleNextSync();
}

function scheduleNextSync() {
  if (syncTimer) return; // Already scheduled
  if (offlineMessageQueue.length === 0) return;

  let delayMs;
  if (offlineMessageQueue.length > 5) {
    // High load: Random between 5 and 10 minutes
    const minMs = 5 * 60 * 1000;
    const maxMs = 10 * 60 * 1000;
    delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  } else {
    // Low load: Approx 30 minutes
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
  offlineMessageQueue = []; // Clear queue
  
  console.log(`[GitHub Batch] Starting batch sync of ${batchToSync.length} offline messages.`);

  // Compress/Minify JSON for batch to save space
  const batchData = JSON.stringify(batchToSync); // Minified JSON
  
  const path = `database/offline_batches/batch_${Date.now()}.json`;
  
  try {
    await axios.put(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
      message: `Batch sync of ${batchToSync.length} offline messages`,
      content: Buffer.from(batchData).toString('base64'),
      branch: BRANCH
    }, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    console.log(`[GitHub Batch] Successfully synced batch to ${path}`);
  } catch (error) {
    console.error(`[GitHub Batch] Failed to sync batch:`, error.message);
    // Put them back in queue on failure
    offlineMessageQueue = [...batchToSync, ...offlineMessageQueue];
    scheduleNextSync(); // Retry later
  }
}

module.exports = {
  saveProfile,
  deleteProfile,
  queueOfflineMessageSync,
};