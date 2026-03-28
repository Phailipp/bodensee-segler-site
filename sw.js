// Segelrevier Service Worker
// Cache strategy:
//   - Static shell (HTML/CSS/JS/i18n): cache-first
//   - Lake data (JSON): stale-while-revalidate (fresh on next visit)
//   - External CDN (tiles, leaflet, fonts): network-only (too large / 3rd party)

const CACHE = 'segelrevier-v1';

const PRECACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './i18n/de.json',
  './i18n/en.json',
  './manifest.json',
  './img/logo.png',
  './favicon.svg',
  './data/lakes.json'
];

// ── Install: pre-cache the shell ───────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: drop stale caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip external CDN (tiles, leaflet, fonts, plausible analytics)
  if (url.origin !== self.location.origin) return;

  // Lake data → stale-while-revalidate
  if (url.pathname.includes('/data/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Detail pages, artikel, etc. → network-first (content may change)
  if (url.pathname.includes('/detail/') || url.pathname.includes('/artikel/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else (shell) → cache-first
  event.respondWith(cacheFirst(request));
});

// ── Strategies ─────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return offline page if available
    return caches.match('./index.html') || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request) || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached ?? (await networkPromise) ?? new Response('Offline', { status: 503 });
}
