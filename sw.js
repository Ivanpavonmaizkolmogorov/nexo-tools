// Nexo Service Worker — Caché offline básico
const CACHE = 'nexo-v1';
const ASSETS = ['/', '/index.html', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('fetch', e => {
  // API calls: network first
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Static: cache first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
