/* ==========================================================================
   SUMMARIZEAI PRO - SERVICE WORKER (OFFLINE PWA CAPABILITY)
   ========================================================================== */

const CACHE_NAME = 'summarizeai-v1.4.0'; // ← bumped: forces cache refresh on all installed devices
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg?v=1.4.0',
  './icons/icon-192.png?v=1.4.0',
  './icons/icon-512.png?v=1.4.0'
];

// Install Event - Cache Core App Shell
// Uses individual caching with catch so a single missing asset doesn't abort
// the entire service worker install (which would block PWA installability).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline app shell');
      // Cache each asset individually — failure of one won't break the rest
      const cachePromises = ASSETS_TO_CACHE.map((url) =>
        cache.add(url).catch((err) => {
          console.warn('[ServiceWorker] Failed to cache:', url, err);
        })
      );
      return Promise.all(cachePromises);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache First with Network Fallback Strategy
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (external APIs, CDNs)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache, update in background (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {/* Offline — ignore background update failure */});
        return cachedResponse;
      }

      // Not in cache — fetch from network
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // If both cache miss and network fail, return offline fallback for HTML
        if (event.request.headers.get('Accept') && event.request.headers.get('Accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Message Listener — allows clients to trigger skipWaiting for immediate update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
