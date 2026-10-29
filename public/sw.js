// Service worker: only shows push notifications (no offline caching, so deploys show up immediately).

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  // iOS requires every push to display a notification.
  event.waitUntil(
    self.registration.showNotification(data.title || 'Quản lý chi tiêu', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon-180.png',
      badge: '/icon-180.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow(event.notification.data?.url || '/');
    }),
  );
});
