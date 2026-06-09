// ============================================================
//  App Config — API Keys & Endpoints
//  সব credentials এখানে centrally manage হবে
// ============================================================
import { Platform } from 'react-native';
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}
export const CONFIG = {
  // ── Supabase ──
  SUPABASE_URL: 'https://spiotvupwogvtxlziezj.supabase.co',
  // NOTE: এটা service_role key — শুধু server-side use করো
  // App-এ এই key সরাসরি ব্যবহার করা হয়নি।
  // Supabase Dashboard → Settings → API → "anon public" key টা নাও এবং এখানে দাও
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwaW90dnVwd29ndnR4bHppZXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3Mjk2MjcsImV4cCI6MjA5NjMwNTYyN30.OAPmD8UfdrU7pjv_KrNQymtjdwb7oK3f1cACQ32kVQc',

  // ── Signaling Server (Hugging Face Space) ──
  // HF Space deploy করার পরে URL টা এখানে দাও
  SIGNALING_SERVER_URL: 'https://rifat1670-app-messenger.hf.space',

  // ── ImgBB (Profile Picture Upload) ──
  IMGBB_API_KEY: 'ba3af1eefabe6d20afa1e4953e03c4a7',

  // ── WebRTC ICE Servers ──
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Free TURN server (for NAT traversal)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],

  // ── Keep Alive Ping ──
  KEEPALIVE_INTERVAL_MS: 3 * 60 * 60 * 1000, // 3 ঘন্টায় একবার
};

export default CONFIG;
