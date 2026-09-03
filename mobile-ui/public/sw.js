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

// Relative, not '/'-rooted. Inside a worker these resolve against the
// worker's own script URL, i.e. the app's directory — which is the same
// thing as the origin root when served by `vite preview`, and is NOT the
// same thing once this UI ships inside a .webhapp and a host decides
// where to serve it (the same reason vite.config.ts sets `base: './'`).
// Rooted paths would 404 in that case.
const SHELL = ['./', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Deliberately NOT cache.addAll: addAll is all-or-nothing, so a
    // single 404 among the shell entries rejects the whole install and
    // the worker never activates — turning a missing icon into "no
    // service worker at all". Precaching is an optimization here (the
    // fetch handler below falls back to the network for anything
    // uncached), so each entry is allowed to fail on its own.
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))
    )
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
