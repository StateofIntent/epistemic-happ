// Minimal service worker — exists to satisfy the installability
// requirement most mobile browsers impose (a registered service worker
// with a fetch handler), not to build a full offline experience. This
// app is useless without a live WebSocket connection to a conductor
// anyway, so there is no offline "mode" to build beyond caching the
// static shell (HTML/CSS/JS) itself, which is what this does: cache on
// install, serve from cache first, fall back to network. A zome call
// itself is never routed through this cache — only same-origin static
// asset GETs are, and the browser's own WebSocket connection to the
// conductor bypasses the service worker entirely regardless.
const CACHE_NAME = 'epistemic-mobile-ui-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icon.svg']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
