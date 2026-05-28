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
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
