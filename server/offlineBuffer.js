const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

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
//  file.io তে ডেটা আপলোড করা
//  returns: { success, url, error }
// ──────────────────────────────────────────────
async function uploadToFileIO(content, filename = 'message.json') {
  try {
    const form = new FormData();
    const buffer = Buffer.from(
      typeof content === 'string' ? content : JSON.stringify(content),
      'utf8'
    );
    form.append('file', buffer, {
      filename,
      contentType: 'application/json',
    });

    const res = await fetch('https://file.io/?expires=14d', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    const json = await res.json();
    if (json.success) {
      console.log(`[OfflineBuffer] Uploaded to file.io: ${json.link}`);
      return { success: true, url: json.link };
    } else {
      throw new Error(json.message || 'Upload failed');
    }
  } catch (e) {
    console.error('[OfflineBuffer] file.io upload error:', e.message);
    return { success: false, error: e.message };
  }
}

// ──────────────────────────────────────────────
//  অফলাইন মেসেজ সেভ করা (text message)
//  message = { text, type, senderId, senderName, originalTimestamp }
// ──────────────────────────────────────────────
async function saveOfflineMessage(receiverId, message) {
  const uploadResult = await uploadToFileIO(message, `msg_${Date.now()}.json`);

  if (!uploadResult.success) {
    return { success: false, error: uploadResult.error };
  }

  const buffer = readBuffer();
  if (!buffer[receiverId]) buffer[receiverId] = [];

  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fileioUrl: uploadResult.url,
    senderId: message.senderId,
    senderName: message.senderName,
    type: message.type || 'text',
    originalTimestamp: message.originalTimestamp || new Date().toISOString(),
    bufferedAt: new Date().toISOString(),
  };

  buffer[receiverId].push(entry);
  writeBuffer(buffer);

  console.log(`[OfflineBuffer] Saved message for ${receiverId}, entry id: ${entry.id}`);
  return { success: true, entryId: entry.id };
}

// ──────────────────────────────────────────────
//  অফলাইন ফাইল সেভ করা
//  fileBuffer = Buffer, mimetype, filename
// ──────────────────────────────────────────────
async function saveOfflineFile(receiverId, fileBuffer, filename, mimetype, senderId, senderName, originalTimestamp) {
  try {
    const form = new FormData();
    form.append('file', fileBuffer, { filename, contentType: mimetype });

    const res = await fetch('https://file.io/?expires=14d', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    const buffer = readBuffer();
    if (!buffer[receiverId]) buffer[receiverId] = [];

    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fileioUrl: json.link,
      senderId,
      senderName,
      type: 'file',
      filename,
      mimetype,
      originalTimestamp: originalTimestamp || new Date().toISOString(),
      bufferedAt: new Date().toISOString(),
    };

    buffer[receiverId].push(entry);
    writeBuffer(buffer);

    console.log(`[OfflineBuffer] Saved file for ${receiverId}: ${filename}`);
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
    try {
      const res = await fetch(entry.fileioUrl);
      // file.io returns the file content directly on first read (auto-delete)
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        let data;

        if (entry.type === 'file') {
          const arrayBuffer = await res.arrayBuffer();
          data = {
            type: 'file',
            buffer: Buffer.from(arrayBuffer).toString('base64'),
            filename: entry.filename,
            mimetype: entry.mimetype,
          };
        } else {
          const text = await res.text();
          try {
            data = JSON.parse(text);
          } catch {
            data = { text };
          }
        }

        delivered.push({ entry, data });
        console.log(`[OfflineBuffer] Delivered entry ${entry.id} to ${receiverId}`);
      } else {
        // file.io URL expired or already consumed
        console.warn(`[OfflineBuffer] Could not fetch ${entry.fileioUrl} (status ${res.status})`);
        delivered.push({ entry, data: null, expired: true });
      }
    } catch (e) {
      console.error(`[OfflineBuffer] Deliver error for entry ${entry.id}:`, e.message);
    }
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
//  (যেসব message buffer-এ ছিল কিন্তু restart এ হারিয়ে গেছে)
//  এই ফাংশন "message_lost" event পাঠাবে sender-দের কাছে
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
