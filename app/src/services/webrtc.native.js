// ============================================================
//  WebRTC Service — P2P Connections
//  1-on-1 chat, voice/video calls, file transfer
// ============================================================
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices } from 'react-native-webrtc';
import { CONFIG } from '../config';
import * as socketService from './socket';

// Active peer connections: userId → RTCPeerConnection
const peerConnections = new Map();

// Data channels: userId → RTCDataChannel
const dataChannels = new Map();

// Event callbacks
const callbacks = {
  onRemoteStream: null,      // (userId, stream) → void
  onMessage: null,           // (userId, message) → void
  onFileProgress: null,      // (userId, progress, filename) → void
  onFileReceived: null,      // (userId, fileData) → void
  onDataChannelOpen: null,   // (userId) → void
  onDataChannelClose: null,  // (userId) → void
};

// File transfer state
const fileReceiveBuffers = new Map(); // userId → { chunks, metadata }

// ──────────────────────────────────────────────
//  Set Callbacks
// ──────────────────────────────────────────────
export function setCallbacks(cbs) {
  Object.assign(callbacks, cbs);
}

// ──────────────────────────────────────────────
//  Create RTCPeerConnection
// ──────────────────────────────────────────────
function createPeerConnection(userId) {
  if (peerConnections.has(userId)) {
    return peerConnections.get(userId);
  }

  const pc = new RTCPeerConnection({
    iceServers: CONFIG.ICE_SERVERS,
    iceCandidatePoolSize: 10,
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socketService.sendIceCandidate({ to: userId, candidate: event.candidate });
    }
  };

  pc.ontrack = (event) => {
    console.log(`[WebRTC] Remote stream from ${userId}`);
    callbacks.onRemoteStream?.(userId, event.streams[0]);
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[WebRTC] ICE state with ${userId}:`, pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      pc.restartIce();
    }
  };

  pc.ondatachannel = (event) => {
    console.log(`[WebRTC] Data channel received from ${userId}`);
    setupDataChannel(userId, event.channel);
  };

  peerConnections.set(userId, pc);
  return pc;
}

// ──────────────────────────────────────────────
//  Data Channel Setup
// ──────────────────────────────────────────────
function setupDataChannel(userId, channel) {
  channel.binaryType = 'arraybuffer';
  dataChannels.set(userId, channel);

  channel.onopen = () => {
    console.log(`[WebRTC] Data channel open with ${userId}`);
    callbacks.onDataChannelOpen?.(userId);
  };

  channel.onclose = () => {
    console.log(`[WebRTC] Data channel closed with ${userId}`);
    dataChannels.delete(userId);
    callbacks.onDataChannelClose?.(userId);
  };

  channel.onmessage = (event) => {
    handleDataChannelMessage(userId, event.data);
  };

  channel.onerror = (e) => {
    console.error(`[WebRTC] Data channel error with ${userId}:`, e.message);
  };
}

// ──────────────────────────────────────────────
//  Handle Incoming Data Channel Messages
// ──────────────────────────────────────────────
function handleDataChannelMessage(userId, rawData) {
  // Check if it's binary (file chunk) or text (JSON message)
  if (rawData instanceof ArrayBuffer) {
    handleFileChunk(userId, rawData);
    return;
  }

  try {
    const parsed = JSON.parse(rawData);

    switch (parsed.type) {
      case 'text':
        callbacks.onMessage?.(userId, parsed);
        break;

      case 'file_start':
        // Begin receiving a file
        fileReceiveBuffers.set(userId, {
          chunks: [],
          metadata: {
            filename: parsed.filename,
            mimetype: parsed.mimetype,
            totalSize: parsed.totalSize,
            totalChunks: parsed.totalChunks,
            timestamp: parsed.timestamp,
          },
          receivedChunks: 0,
        });
        console.log(`[WebRTC] Starting file receive from ${userId}: ${parsed.filename}`);
        break;

      case 'file_end':
        // File transfer complete
        const fileState = fileReceiveBuffers.get(userId);
        if (fileState) {
          const allChunks = fileState.chunks;
          const totalLength = allChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of allChunks) {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }

          callbacks.onFileReceived?.(userId, {
            ...fileState.metadata,
            data: combined.buffer,
          });

          fileReceiveBuffers.delete(userId);
          console.log(`[WebRTC] File received from ${userId}: ${fileState.metadata.filename}`);
        }
        break;

      default:
        callbacks.onMessage?.(userId, parsed);
    }
  } catch (e) {
    console.error('[WebRTC] Parse error:', e.message);
  }
}

function handleFileChunk(userId, chunk) {
  const fileState = fileReceiveBuffers.get(userId);
  if (!fileState) return;

  fileState.chunks.push(chunk);
  fileState.receivedChunks++;

  const progress = fileState.receivedChunks / fileState.metadata.totalChunks;
  callbacks.onFileProgress?.(userId, progress, fileState.metadata.filename);
}

// ──────────────────────────────────────────────
//  Initiate a Call (Caller side)
// ──────────────────────────────────────────────
export async function initiateCall({ targetUserId, callType = 'video', withDataChannel = true }) {
  const pc = createPeerConnection(targetUserId);

  // Create data channel if needed (for chat)
  if (withDataChannel) {
    const dc = pc.createDataChannel('chat', { ordered: true });
    setupDataChannel(targetUserId, dc);
  }

  // Get local media
  let localStream = null;
  if (callType !== 'data') {
    try {
      localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video' ? {
          facingMode: 'user',
          width: { min: 640, ideal: 1280 },
          height: { min: 480, ideal: 720 },
          frameRate: { ideal: 30 },
        } : false,
      });

      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    } catch (e) {
      console.error('[WebRTC] getUserMedia error:', e.message);
      throw e;
    }
  }

  // Create and send offer
  const offer = await pc.createOffer({
    offerToReceiveAudio: callType !== 'data',
    offerToReceiveVideo: callType === 'video',
  });
  await pc.setLocalDescription(offer);

  socketService.sendOffer({ to: targetUserId, offer, callType });

  return { pc, localStream };
}

// ──────────────────────────────────────────────
//  Handle Incoming Call (Callee side)
// ──────────────────────────────────────────────
export async function handleIncomingOffer({ fromUserId, offer, callType }) {
  const pc = createPeerConnection(fromUserId);

  // Get local media
  let localStream = null;
  if (callType !== 'data') {
    try {
      localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video' ? { facingMode: 'user' } : false,
      });

      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    } catch (e) {
      console.error('[WebRTC] getUserMedia error:', e.message);
    }
  }

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socketService.sendAnswer({ to: fromUserId, answer });

  return { pc, localStream };
}

// ──────────────────────────────────────────────
//  Handle Answer
// ──────────────────────────────────────────────
export async function handleAnswer({ fromUserId, answer }) {
  const pc = peerConnections.get(fromUserId);
  if (pc && pc.signalingState !== 'stable') {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

// ──────────────────────────────────────────────
//  Handle ICE Candidate
// ──────────────────────────────────────────────
export async function handleIceCandidate({ fromUserId, candidate }) {
  const pc = peerConnections.get(fromUserId);
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('[WebRTC] ICE candidate error:', e.message);
    }
  }
}

// ──────────────────────────────────────────────
//  Send Text Message via Data Channel
// ──────────────────────────────────────────────
export function sendP2PMessage({ toUserId, text, timestamp }) {
  const dc = dataChannels.get(toUserId);
  if (!dc || dc.readyState !== 'open') {
    console.warn('[WebRTC] Data channel not ready for', toUserId);
    return false;
  }

  dc.send(JSON.stringify({
    type: 'text',
    text,
    timestamp: timestamp || new Date().toISOString(),
  }));
  return true;
}

// ──────────────────────────────────────────────
//  Send File via Data Channel (chunked)
// ──────────────────────────────────────────────
export async function sendP2PFile({ toUserId, fileBuffer, filename, mimetype, onProgress }) {
  const dc = dataChannels.get(toUserId);
  if (!dc || dc.readyState !== 'open') {
    console.warn('[WebRTC] Data channel not ready for file transfer');
    return false;
  }

  const CHUNK_SIZE = 64 * 1024; // 64KB chunks
  const totalChunks = Math.ceil(fileBuffer.byteLength / CHUNK_SIZE);
  const timestamp = new Date().toISOString();

  // Send file metadata
  dc.send(JSON.stringify({
    type: 'file_start',
    filename,
    mimetype,
    totalSize: fileBuffer.byteLength,
    totalChunks,
    timestamp,
  }));

  // Send chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileBuffer.byteLength);
    const chunk = fileBuffer.slice(start, end);
    dc.send(chunk);

    const progress = (i + 1) / totalChunks;
    onProgress?.(progress);

    // Small delay to prevent buffer overflow
    if (i % 16 === 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // Signal end
  dc.send(JSON.stringify({ type: 'file_end', filename, timestamp }));
  console.log(`[WebRTC] File sent to ${toUserId}: ${filename}`);
  return true;
}

// ──────────────────────────────────────────────
//  Toggle Camera / Mute
// ──────────────────────────────────────────────
export function toggleMute(stream, muted) {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });
}

export function toggleCamera(stream, hidden) {
  stream?.getVideoTracks().forEach((track) => {
    track.enabled = !hidden;
  });
}

export async function switchCamera(stream) {
  const videoTrack = stream?.getVideoTracks()[0];
  if (videoTrack && videoTrack._switchCamera) {
    videoTrack._switchCamera();
  }
}

// ──────────────────────────────────────────────
//  Close Connection
// ──────────────────────────────────────────────
export function closeConnection(userId) {
  const pc = peerConnections.get(userId);
  if (pc) {
    pc.close();
    peerConnections.delete(userId);
  }

  const dc = dataChannels.get(userId);
  if (dc) {
    dc.close();
    dataChannels.delete(userId);
  }

  fileReceiveBuffers.delete(userId);
  console.log(`[WebRTC] Connection closed with ${userId}`);
}

export function closeAllConnections() {
  peerConnections.forEach((_, userId) => closeConnection(userId));
}

export function isDataChannelOpen(userId) {
  const dc = dataChannels.get(userId);
  return dc?.readyState === 'open';
}

export function getPeerConnection(userId) {
  return peerConnections.get(userId);
}
