// ============================================================
//  FCM Helper — Firebase Cloud Messaging
//  firebase_config.js ফাইলে তোমার Firebase credentials দাও
// ============================================================
const firebaseConfig = require('./firebase_config');

let admin = null;
let messaging = null;
let initialized = false;

function initFirebase() {
  if (initialized) return;

  if (!firebaseConfig.FIREBASE_CONFIG) {
    console.warn('[FCM] Firebase config not set. Push notifications will be disabled.');
    console.warn('[FCM] Fill in server/firebase_config.js to enable push notifications.');
    return;
  }

  try {
    admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig.FIREBASE_CONFIG),
    });
    messaging = admin.messaging();
    initialized = true;
    console.log('[FCM] Firebase Admin initialized successfully ✅');
  } catch (e) {
    console.error('[FCM] Firebase init error:', e.message);
  }
}

// ──────────────────────────────────────────────
//  Incoming Call Notification পাঠানো
// ──────────────────────────────────────────────
async function sendCallNotification({ fcmToken, callerName, callerId, callType = 'video', roomId }) {
  if (!initialized || !messaging) {
    console.warn('[FCM] Skipping push — Firebase not initialized');
    return { success: false, reason: 'firebase_not_initialized' };
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title: `📞 Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`,
        body: `${callerName} is calling you...`,
      },
      data: {
        type: 'incoming_call',
        callerId,
        callerName,
        callType,
        roomId: roomId || '',
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'incoming_calls',
          priority: 'max',
          defaultVibrateTimings: true,
          defaultSound: true,
          fullScreenIntent: true,
        },
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default',
            badge: 1,
          },
        },
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'voip',
        },
      },
    };

    const response = await messaging.send(message);
    console.log(`[FCM] Call notification sent to ${fcmToken.slice(0, 20)}...`);
    return { success: true, messageId: response };
  } catch (e) {
    console.error('[FCM] Send call notification error:', e.message);
    return { success: false, error: e.message };
  }
}

// ──────────────────────────────────────────────
//  নতুন মেসেজ Notification পাঠানো
// ──────────────────────────────────────────────
async function sendMessageNotification({ fcmToken, senderName, senderId, messagePreview, pendingCount = 1 }) {
  if (!initialized || !messaging) {
    console.warn('[FCM] Skipping push — Firebase not initialized');
    return { success: false, reason: 'firebase_not_initialized' };
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title: senderName,
        body: messagePreview || 'You have a new message',
      },
      data: {
        type: 'new_message',
        senderId,
        senderName,
        pendingCount: String(pendingCount),
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'messages',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            badge: pendingCount,
            sound: 'default',
          },
        },
      },
    };

    const response = await messaging.send(message);
    console.log(`[FCM] Message notification sent to ${fcmToken.slice(0, 20)}...`);
    return { success: true, messageId: response };
  } catch (e) {
    console.error('[FCM] Send message notification error:', e.message);
    return { success: false, error: e.message };
  }
}

// ──────────────────────────────────────────────
//  "Message Lost" Notification পাঠানো
//  (Ultra-Private Ephemeral Feature)
// ──────────────────────────────────────────────
async function sendMessageLostNotification({ fcmToken, receiverName, entryCount = 1 }) {
  if (!initialized || !messaging) return { success: false };

  try {
    const message = {
      token: fcmToken,
      notification: {
        title: '⚠️ Message Delivery Failed',
        body: `${entryCount} message(s) to ${receiverName} could not be delivered`,
      },
      data: {
        type: 'message_lost',
        receiverName,
        entryCount: String(entryCount),
        timestamp: new Date().toISOString(),
      },
      android: { priority: 'normal' },
    };

    await messaging.send(message);
    return { success: true };
  } catch (e) {
    console.error('[FCM] Send lost notification error:', e.message);
    return { success: false };
  }
}

module.exports = {
  initFirebase,
  sendCallNotification,
  sendMessageNotification,
  sendMessageLostNotification,
};
