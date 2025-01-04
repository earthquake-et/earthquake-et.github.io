// service worker for push notifications
self.addEventListener('push', function(event) {
    const options = {
        body: event.data.text(),
        icon: '/icon.png',
        badge: '/badge.png'
    };

    event.waitUntil(
        self.registration.showNotification('Earthquake Alert', options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/') // Replace '/' with the actual URL of your app if needed.
  );
});
