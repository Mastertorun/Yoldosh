// Yo'ldosh service worker: app shell offline, network-first for data
const CACHE = 'yoldosh-v3';
const SHELL = ['./', 'index.html', 'app.js', 'i18n.js', 'style.css', 'icon.svg', 'manifest.webmanifest', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'vendor/supabase.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('supabase.co')) return; // never cache API
  const isShell = u.origin === location.origin;
  const isLib = /unpkg\.com|cdn\.jsdelivr\.net|telegram\.org/.test(u.hostname);
  if (isShell) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  } else if (isLib) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return res; })));
  }
});
