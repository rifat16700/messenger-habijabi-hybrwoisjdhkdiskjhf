importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB8qqxWLZmnHyawkU1_8ENvhhXOkBgpDwA",
  authDomain: "linko-14235.firebaseapp.com",
  projectId: "linko-14235",
  storageBucket: "linko-14235.firebasestorage.app",
  messagingSenderId: "951577535380",
  appId: "1:951577535380:web:cc14d761d91f098f30e581"
});

const messaging = firebase.messaging();

// App বন্ধ থাকলে বা background এ থাকলে Firebase এই function call করে
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const notificationTitle = payload.notification?.title || payload.data?.senderName || 'New Message';
  const notificationBody  = payload.notification?.body  || payload.data?.messagePreview || 'You have a new message';
  const callType          = payload.data?.type;

  const options = {
    body: notificationBody,
    icon: '/assets/favicon.png',
    badge: '/assets/favicon.png',
    tag: callType === 'incoming_call' ? 'incoming-call' : 'new-message',
    renotify: true,
    requireInteraction: callType === 'incoming_call', // Call notification stays until dismissed
    vibrate: callType === 'incoming_call' ? [500, 200, 500, 200, 500] : [200],
    data: { url: self.registration.scope },
    actions: callType === 'incoming_call'
      ? [
          { action: 'accept', title: '✅ Accept' },
          { action: 'reject', title: '❌ Decline' }
        ]
      : [{ action: 'open', title: '💬 Open Chat' }],
  };

  self.registration.showNotification(notificationTitle, options);
});

// Notification click → App open
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(self.registration.scope);
    })
  );
});

