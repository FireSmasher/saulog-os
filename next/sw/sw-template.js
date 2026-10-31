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

// ---------- Daily reminder (phase 6) ----------
// The Edge Function push-daily sends {title, body, url}. Tapping opens the app.
self.addEventListener('push', (event) => {
  let data = { title: 'Saulog OS', body: 'Nothing logged yet today. Snap your next meal.', url: './' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // plain text push: keep the default words
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'saulog-daily',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.registration.scope))
      return open ? open.focus() : self.clients.openWindow(target)
    })
  )
})
