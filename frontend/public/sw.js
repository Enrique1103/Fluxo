const CACHE = 'fluxo-v1'
const STATIC = ['/']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  // API: red primero, caché como respaldo
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res })
        .catch(() => caches.match(e.request))
    )
    return
  }
  // Estático: caché primero
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
