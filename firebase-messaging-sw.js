importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Dynamically fetch Firebase Web Config from server environment variables on SW boot
fetch('/api/notifications/firebase-config')
  .then(res => res.json())
  .then(config => {
    if (!config || !config.apiKey || config.apiKey === 'mock-api-key') {
      console.warn('[Firebase SW] Firebase credentials not configured on server yet.');
      return;
    }

    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    // Intercept background push messaging events when the app is closed or suspended
    messaging.onBackgroundMessage((payload) => {
      console.log('[Firebase SW] Intercepted background push message: ', payload);
      
      const notificationTitle = payload.notification ? payload.notification.title : (payload.data ? payload.data.title : 'עדכון חדש');
      const notificationBody = payload.notification ? payload.notification.body : (payload.data ? payload.data.body : '');
      const notificationIcon = payload.notification ? payload.notification.icon : (payload.data ? payload.data.icon : 'https://cdn-icons-png.flaticon.com/512/2910/2910312.png');
      
      const options = {
        body: notificationBody,
        icon: notificationIcon || 'https://cdn-icons-png.flaticon.com/512/2910/2910312.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2910/2910312.png',
        vibrate: [100, 50, 100],
        data: {
          url: '/'
        }
      };

      return self.registration.showNotification(notificationTitle, options);
    });
  })
  .catch(err => {
    console.error('[Firebase SW] Initialization failed:', err.message);
  });

// Handle notification click to focus active PWA or WebView window
self.addEventListener('notificationclick', event => {
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
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => console.log('SW Cache AddAll warning:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
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
  // Exclude API requests and non-GET requests from local cache completely
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
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
