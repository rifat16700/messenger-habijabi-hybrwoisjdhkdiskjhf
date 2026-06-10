const fs = require('fs');
const path = require('path');
const os = require('os');

const BUFFER_FILE = path.join(__dirname, 'offline_buffer.json');

// ফাইলগুলো /tmp/offline_files/ এ রাখব — disk limit = HF server disk size
const FILES_DIR = path.join(os.tmpdir(), 'offline_files');
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

// ──────────────────────────────────────────────
//  offline_buffer.json পড়া ও লেখা
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
//  Text Message সেভ করা
// ──────────────────────────────────────────────
async function saveOfflineMessage(receiverId, message) {
  const buffer = readBuffer();
  if (!buffer[receiverId]) buffer[receiverId] = [];

  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderId: message.senderId,
    senderName: message.senderName,
    type: 'text',
    text: message.text,
    originalTimestamp: message.originalTimestamp || new Date().toISOString(),
    bufferedAt: new Date().toISOString(),
  };

  buffer[receiverId].push(entry);
  writeBuffer(buffer);

  console.log(`[OfflineBuffer] Saved message for ${receiverId} (${entry.id})`);
  return { success: true, entryId: entry.id };
}

// ──────────────────────────────────────────────
//  File সেভ করা — disk এ রাখা, no size limit
//  fileData = Buffer বা base64 string
// ──────────────────────────────────────────────
async function saveOfflineFile(receiverId, fileData, filename, mimetype, senderId, senderName, originalTimestamp) {
  try {
    const entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const safeName = `${entryId}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const diskPath = path.join(FILES_DIR, safeName);

    // Buffer বা base64 string দুটোই handle করা
    const fileBuffer = Buffer.isBuffer(fileData)
      ? fileData
      : Buffer.from(fileData, 'base64');

    fs.writeFileSync(diskPath, fileBuffer);
    const sizeKB = Math.round(fileBuffer.length / 1024);
    console.log(`[OfflineBuffer] Saved file to disk: ${safeName} (${sizeKB} KB)`);

    const buffer = readBuffer();
    if (!buffer[receiverId]) buffer[receiverId] = [];

    buffer[receiverId].push({
      id: entryId,
      senderId,
      senderName,
      type: 'file',
      filename,
      mimetype,
      diskPath,      // disk এ file এর path
      sizeBytes: fileBuffer.length,
      originalTimestamp: originalTimestamp || new Date().toISOString(),
      bufferedAt: new Date().toISOString(),
    });

    writeBuffer(buffer);
    return { success: true, entryId };
  } catch (e) {
    console.error('[OfflineBuffer] saveOfflineFile error:', e.message);
    return { success: false, error: e.message };
  }
}

// ──────────────────────────────────────────────
//  Pending message/file deliver করা
// ──────────────────────────────────────────────
async function deliverPendingMessages(receiverId) {
  const buffer = readBuffer();
  const pending = buffer[receiverId] || [];

  if (pending.length === 0) return [];

  const delivered = [];

  for (const entry of pending) {
    let data;

    if (entry.type === 'file') {
      // Disk থেকে file পড়া
      if (entry.diskPath && fs.existsSync(entry.diskPath)) {
        try {
          const fileBuffer = fs.readFileSync(entry.diskPath);
          data = {
            type: 'file',
            buffer: fileBuffer.toString('base64'),
            filename: entry.filename,
            mimetype: entry.mimetype,
            sizeBytes: entry.sizeBytes,
          };
          // Deliver হলে disk থেকে delete
          fs.unlinkSync(entry.diskPath);
          console.log(`[OfflineBuffer] Delivered & deleted file: ${entry.diskPath}`);
        } catch (e) {
          console.error(`[OfflineBuffer] File read error: ${e.message}`);
          data = null;
        }
      } else {
        console.warn(`[OfflineBuffer] File not found on disk: ${entry.diskPath}`);
        data = null;
      }
    } else {
      data = { text: entry.text };
    }

    if (data) {
      const cleanEntry = { ...entry };
      delete cleanEntry.diskPath;
      delivered.push({ entry: cleanEntry, data });
      console.log(`[OfflineBuffer] Delivered entry ${entry.id} to ${receiverId}`);
    }
  }

  // Deliver হওয়া সব entry মুছে দাও
  buffer[receiverId] = [];
  writeBuffer(buffer);

  return delivered;
}

// ──────────────────────────────────────────────
//  Pending count
// ──────────────────────────────────────────────
function getPendingCount(userId) {
  const buffer = readBuffer();
  return (buffer[userId] || []).length;
}

// ──────────────────────────────────────────────
//  Orphan entry finder (server restart এ)
// ──────────────────────────────────────────────
function getLostMessageSenders() {
  const buffer = readBuffer();
  const senderMap = {};

  for (const [receiverId, entries] of Object.entries(buffer)) {
    for (const entry of entries) {
      if (!senderMap[entry.senderId]) senderMap[entry.senderId] = [];
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

// ──────────────────────────────────────────────
//  Stale file cleanup (7 দিনের পুরনো file মুছে দাও)
// ──────────────────────────────────────────────
function cleanupStaleFiles() {
  try {
    const files = fs.readdirSync(FILES_DIR);
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const f of files) {
      const fp = path.join(FILES_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > SEVEN_DAYS) {
        fs.unlinkSync(fp);
        count++;
      }
    }
    if (count > 0) console.log(`[OfflineBuffer] Cleaned up ${count} stale files`);
  } catch (e) { /* ignore */ }
}

// Server start হলে stale files clean করো
cleanupStaleFiles();

module.exports = {
  saveOfflineMessage,
  saveOfflineFile,
  deliverPendingMessages,
  getPendingCount,
  getLostMessageSenders,
  readBuffer,
};
