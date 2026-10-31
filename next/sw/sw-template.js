// Saulog OS (next) service worker. vite.config.ts fills in VERSION and ASSETS at build time.
// Scope is /saulog-os/next/ only, so the old app's worker at the root is never touched.
const VERSION = '__VERSION__'
const PREFIX = 'saulog-next-'
const CACHE = PREFIX + VERSION
const ASSETS = __ASSETS__
const NAV_TIMEOUT_MS = 3000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) }
    )
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Supabase and every other site: straight to the network, never cached.
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return

  if (request.mode === 'navigate') {
    // Network first, so a new deploy shows on the next open; the cached app when offline or slow.
    event.respondWith(
      withTimeout(fetch(request), NAV_TIMEOUT_MS).catch(() =>
        caches.match('./index.html', { cacheName: CACHE }).then((hit) => hit || fetch(request))
      )
    )
    return
  }

  // Built files have a content hash in their name, so the cached copy is always right.
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((hit) => hit || fetch(request)))
})
