const fs = require('fs');
const path = require('path');

const BUFFER_FILE = path.join(__dirname, 'offline_buffer.json');

// ──────────────────────────────────────────────
//  offline_buffer.json পড়া ও লেখার হেল্পার
// ──────────────────────────────────────────────
function readBuffer() {
  try {
    if (!fs.existsSync(BUFFER_FILE)) {
      fs.writeFileSync(BUFFER_FILE, JSON.stringify({}), 'utf8');
    }
    const raw = fs.readFileSync(BUFFER_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[OfflineBuffer] Read error:', e.message);
    return {};
  }
}

function writeBuffer(data) {
  try {
    fs.writeFileSync(BUFFER_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[OfflineBuffer] Write error:', e.message);
  }
}

// ──────────────────────────────────────────────
//  অফলাইন মেসেজ সেভ করা (text message)
//  message = { text, type, senderId, senderName, originalTimestamp }
// ──────────────────────────────────────────────
async function saveOfflineMessage(receiverId, message) {
  const buffer = readBuffer();
  if (!buffer[receiverId]) buffer[receiverId] = [];

  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderId: message.senderId,
    senderName: message.senderName,
    type: message.type || 'text',
    text: message.text, // Store payload directly
    originalTimestamp: message.originalTimestamp || new Date().toISOString(),
    bufferedAt: new Date().toISOString(),
  };

  buffer[receiverId].push(entry);
  writeBuffer(buffer);

  console.log(`[OfflineBuffer] Saved local message for ${receiverId}, entry id: ${entry.id}`);
  return { success: true, entryId: entry.id };
}

// ──────────────────────────────────────────────
//  অফলাইন ফাইল সেভ করা
//  fileBuffer = Buffer, mimetype, filename
// ──────────────────────────────────────────────
async function saveOfflineFile(receiverId, fileBuffer, filename, mimetype, senderId, senderName, originalTimestamp) {
  try {
    const buffer = readBuffer();
    if (!buffer[receiverId]) buffer[receiverId] = [];

    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderId,
      senderName,
      type: 'file',
      filename,
      mimetype,
      fileData: fileBuffer.toString('base64'), // Store base64 directly
      originalTimestamp: originalTimestamp || new Date().toISOString(),
      bufferedAt: new Date().toISOString(),
    };

    buffer[receiverId].push(entry);
    writeBuffer(buffer);

    console.log(`[OfflineBuffer] Saved local file for ${receiverId}: ${filename}`);
    return { success: true, entryId: entry.id };
  } catch (e) {
    console.error('[OfflineBuffer] saveOfflineFile error:', e.message);
    return { success: false, error: e.message };
  }
}

// ──────────────────────────────────────────────
//  ইউজার অনলাইনে এলে pending মেসেজ ডেলিভার করা
//  returns: [{ entry, data }] array
// ──────────────────────────────────────────────
async function deliverPendingMessages(receiverId) {
  const buffer = readBuffer();
  const pending = buffer[receiverId] || [];

  if (pending.length === 0) return [];

  const delivered = [];

  for (const entry of pending) {
    let data;
    if (entry.type === 'file') {
      data = {
        type: 'file',
        buffer: entry.fileData,
        filename: entry.filename,
        mimetype: entry.mimetype,
      };
    } else {
      data = { text: entry.text };
    }

    // Prepare a clean entry without the massive file payload to return
    const cleanEntry = { ...entry };
    delete cleanEntry.text;
    delete cleanEntry.fileData;

    delivered.push({ entry: cleanEntry, data });
    console.log(`[OfflineBuffer] Delivered local entry ${entry.id} to ${receiverId}`);
  }

  // সব entry মুছে দাও
  buffer[receiverId] = [];
  writeBuffer(buffer);

  return delivered;
}

// ──────────────────────────────────────────────
//  কোনো ইউজারের pending count দেখা
// ──────────────────────────────────────────────
function getPendingCount(userId) {
  const buffer = readBuffer();
  return (buffer[userId] || []).length;
}

// ──────────────────────────────────────────────
//  সার্ভার restart এর পরে orphan entries চেক করা
// ──────────────────────────────────────────────
function getLostMessageSenders() {
  const buffer = readBuffer();
  const senderMap = {}; // senderId → [entries]

  for (const [receiverId, entries] of Object.entries(buffer)) {
    for (const entry of entries) {
      if (!senderMap[entry.senderId]) {
        senderMap[entry.senderId] = [];
      }
      senderMap[entry.senderId].push({
        entryId: entry.id,
        receiverId,
        originalTimestamp: entry.originalTimestamp,
        type: entry.type,
        filename: entry.filename,
      });
    }
  }

  return senderMap;
}

module.exports = {
  saveOfflineMessage,
  saveOfflineFile,
  deliverPendingMessages,
  getPendingCount,
  getLostMessageSenders,
  readBuffer,
};
