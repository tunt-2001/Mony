// Service worker: makes the app open instantly from cache, and shows push notifications.
//
// - /assets/*: hashed by the build, so never changes once cached (cache-first).
// - The page itself: served from cache at once and refreshed in the background, so a new
//   deploy shows on the launch after the one that fetched it.
// - Everything else, including all API calls to Supabase, goes to the network untouched.

const CACHE = 'app-v1';
const MAX_ASSETS = 40;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimAssets(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'));
  // Oldest first (insertion order): old builds' files go first.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((r) => cache.delete(r)));
}

async function assetFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    trimAssets(cache);
  }
  return res;
}

async function pageStaleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match('/');
  const refresh = fetch(event.request).then((res) => {
    if (res.ok) cache.put('/', res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(pageStaleWhileRevalidate(event));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(assetFirst(request));
});

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
      const url = event.notification.data?.url || '/';
      const open = list.find((c) => 'focus' in c);
      if (!open) return self.clients.openWindow(url);
      // Reload the open app on the notification's page (e.g. last month for the monthly report).
      return open.focus().then((c) => (url !== '/' && c.navigate ? c.navigate(url) : c));
    }),
  );
});
