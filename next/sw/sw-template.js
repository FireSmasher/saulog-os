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

// ---------- Reminders (W7) ----------
// The Edge Function nudge sends {title, body, url, event_id, tag, api, key}. Plain
// showNotification with no requireInteraction, so it still shows (quietly) under Focus and
// Sleep. Tapping opens the app and, when it can, reports the tap (mark_push_opened RPC).
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
      tag: typeof data.tag === 'string' && data.tag ? data.tag : 'saulog-daily',
      data: { url: data.url, eventId: data.event_id || null, api: data.api || null, key: data.key || null },
    })
  )
})

// The session token, if the app stored one where a worker can read it. The app's Supabase
// session lives in localStorage, which a worker cannot read, so the contract is: the app MAY
// put {"access_token": "...", "expires_at": <unix seconds>} at SESSION_URL in the Cache
// Storage cache SESSION_CACHE (a name outside PREFIX, so activate never deletes it).
// No entry, an expired token or any error: null, and the tap is simply not reported.
const SESSION_CACHE = 'apoy-session'
const SESSION_URL = './__session'

async function storedToken() {
  try {
    const cache = await caches.open(SESSION_CACHE)
    const hit = await cache.match(new URL(SESSION_URL, self.registration.scope).href)
    if (!hit) return null
    const s = await hit.json()
    if (!s || typeof s.access_token !== 'string') return null
    if (typeof s.expires_at === 'number' && s.expires_at * 1000 < Date.now()) return null
    return s.access_token
  } catch {
    return null
  }
}

async function reportOpened(d) {
  if (!d || !d.eventId) return
  try {
    // An open window may report it with its own session (optional; ignored when unhandled).
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) w.postMessage({ type: 'apoy-push-opened', eventId: d.eventId })
    const token = await storedToken()
    if (!token || !d.api || !d.key) return // nothing proves who he is: skip quietly
    await fetch(String(d.api).replace(/\/+$/, '') + '/rest/v1/rpc/mark_push_opened', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: d.key, Authorization: 'Bearer ' + token },
      body: JSON.stringify({ event_id: d.eventId }),
    })
  } catch {
    // offline or blocked: the open is not counted, nothing else changes
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const d = event.notification.data || {}
  const target = new URL(d.url || './', self.registration.scope).href
  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
        const open = wins.find((w) => w.url.startsWith(self.registration.scope))
        return open ? open.focus() : self.clients.openWindow(target)
      }),
      reportOpened(d),
    ])
  )
})
