// Firebase Cloud Messaging Service Worker
// This handles background push notifications for POS orders

// Use compatible version for service workers
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Firebase configuration will be set dynamically
let firebaseConfig = null;
let messaging = null;

// Listen for messages from the main thread to set Firebase config
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    firebaseConfig = event.data.config;
    initializeFirebase();
  }
});

function initializeFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    console.warn('[SW] Firebase config not available');
    return;
  }

  try {
    // Check if Firebase is already initialized
    let app;
    try {
      app = firebase.app();
    } catch (e) {
      // Firebase not initialized, initialize it
      app = firebase.initializeApp(firebaseConfig);
    }
    
    messaging = firebase.messaging(app);
    
    // Handle background messages - this is called when app is in background
    messaging.onBackgroundMessage((payload) => {
      console.log('[SW] ✅ Received background message:', payload);
      
      const notificationTitle = payload.notification?.title || payload.data?.title || 'New Order';
      const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || 'You have a new order',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: payload.data?.orderId || 'pos-order',
        data: payload.data || payload,
        requireInteraction: false,
        silent: false,
        timestamp: Date.now()
      };

      // Show notification immediately
      return self.registration.showNotification(notificationTitle, notificationOptions);
    });

    console.log('[SW] ✅ Firebase messaging initialized successfully');
  } catch (error) {
    console.error('[SW] ❌ Error initializing Firebase:', error);
  }
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  // Focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Try to get config from cache on service worker activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.open('firebase-config').then((cache) => {
      return cache.match('config').then((response) => {
        if (response) {
          return response.json().then((config) => {
            firebaseConfig = config;
            initializeFirebase();
          });
        }
      });
    }).catch(() => {
      // Config not in cache, will be set via message
    })
  );
});

