self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  // API calls siempre van a la red
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request))
    return
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
})
