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

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Optional: customize notification if needed. 
  // Firebase usually handles background push display automatically based on 'notification' payload.
});
