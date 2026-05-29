importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

console.log('⭐⭐⭐ [Firebase SW] Booting Service Worker...');

const firebaseConfig = {
  apiKey: "AIzaSyCU1ANCETIoZxieZIoNMhnA-zl3jhyzv0U",
  authDomain: "portfoliopulse-22795.firebaseapp.com",
  projectId: "portfoliopulse-22795",
  storageBucket: "portfoliopulse-22795.firebasestorage.app",
  messagingSenderId: "279949836627",
  appId: "1:279949836627:web:ec383103a14201373721a6",
  measurementId: "G-HNZF1T7CJB"
};

// Initialize Firebase synchronously at boot time
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
console.log('⭐⭐⭐ [Firebase SW] Firebase initialized successfully in SW context!');

// Register background message interception synchronously
messaging.onBackgroundMessage((payload) => {
  console.log('⭐⭐⭐ [Firebase SW] Intercepted background push message: ', payload);
  // Manual showNotification call removed to prevent duplicate notifications.
  // The Firebase SDK automatically displays the notification block when received in the background.
});

// Handle notification click to focus active PWA or WebView window
self.addEventListener('notificationclick', event => {
  console.log('⭐⭐⭐ [Firebase SW] Notification clicked:', event.notification);
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        try {
          const clientPath = new URL(client.url).pathname;
          if ((clientPath === '/' || clientPath === '/index.html') && 'focus' in client) {
            return client.focus();
          }
        } catch (e) {
          // Ignore URL parse failures
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

/* ==================== Offline PWA Asset Caching ==================== */
const CACHE_NAME = 'portfoliopulse-v2.3.0';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/api.js',
  '/calculations.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Rubik:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

self.addEventListener('install', event => {
  console.log('[Firebase SW] Installing and pre-caching assets...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => console.log('SW Cache AddAll warning:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[Firebase SW] Activating and cleaning old caches...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Exclude non-GET requests, API requests, FCM, and Google/Firebase SDKs from local cache completely
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('/api/') || 
    event.request.url.includes('googleapis') || 
    event.request.url.includes('firebase') ||
    event.request.url.includes('fcm')
  ) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If network request succeeds, clone and store it in cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails (offline mode)
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
        });
      })
  );
});
