// ============================================================
//  Notifications Service — Expo Push Notifications + FCM
// ============================================================
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    // For incoming calls — show as high priority even in foreground
    const isCall = data?.type === 'incoming_call';
    return {
      shouldShowAlert: true,
      shouldPlaySound: isCall,
      shouldSetBadge: !isCall,
      priority: isCall
        ? Notifications.AndroidNotificationPriority.MAX
        : Notifications.AndroidNotificationPriority.HIGH,
    };
  },
});

// ──────────────────────────────────────────────
//  Setup Notification Channels (Android)
// ──────────────────────────────────────────────
export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('incoming_calls', {
    name: 'Incoming Calls',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6366F1',
    sound: 'default',
    enableLights: true,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250],
    lightColor: '#6366F1',
    sound: 'default',
  });
}

// ──────────────────────────────────────────────
//  Get Push Token
// ──────────────────────────────────────────────
export async function registerForPushNotifications() {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.warn('[Notifications] Must be on physical device for push notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted');
    return null;
  }

  await setupNotificationChannels();

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Expo Go তে undefined রাখো
    });
    console.log('[Notifications] Expo Push Token:', tokenData.data);
    return tokenData.data;
  } catch (e) {
    console.error('[Notifications] Token error:', e.message);
    return null;
  }
}

// ──────────────────────────────────────────────
//  Show Local Notification
// ──────────────────────────────────────────────
export async function showLocalNotification({ title, body, data = {} }) {
  if (Platform.OS === 'web') {
    // Basic fallback for web
    console.log(`[Web Notification] ${title}: ${body}`);
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: null, // Immediately
  });
}

// ──────────────────────────────────────────────
//  Show Incoming Call Notification (Full Screen)
// ──────────────────────────────────────────────
export async function showIncomingCallNotification({ callerName, callType, callerId }) {
  if (Platform.OS === 'web') {
    console.log(`[Web Incoming Call] ${callerName} is calling...`);
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `📞 Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`,
      body: `${callerName} is calling...`,
      data: { type: 'incoming_call', callerId, callerName, callType },
      sound: 'default',
      priority: 'max',
      sticky: true,
    },
    trigger: null,
  });
}

// ──────────────────────────────────────────────
//  Dismiss All Notifications
// ──────────────────────────────────────────────
export async function dismissAllNotifications() {
  await Notifications.dismissAllNotificationsAsync();
}

// ──────────────────────────────────────────────
//  Notification Response Handler
// ──────────────────────────────────────────────
export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

export function addNotificationReceivedListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}
