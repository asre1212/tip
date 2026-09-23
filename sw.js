/* Tip Calculator service worker — offline support + auto-update.
   Keep APP_VERSION in sync with index.html and version.json on every release. */
const APP_VERSION = '1.2.0';
const CACHE = 'tip-calc-v' + APP_VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './receipt-autofill.js',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './favicon.png',
  './version.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 'reload' bypasses the HTTP cache so an install always picks up fresh files.
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
      } catch (e) {
        /* a missing/offline asset must not abort the install */
      }
    }));
    // No skipWaiting() here: the page decides when it is safe to swap in the
    // new version (immediately when the form is empty, otherwise on tap).
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw e;
  }
}

function patchIndexHtml(html) {
  let patched = html
    .replace(/v1\.1\.0/g, 'v1.2.0')
    .replace(/APP_VERSION = '1\.1\.0'/g, "APP_VERSION = '1.2.0'");

  if (!patched.includes('receipt-autofill.js')) {
    patched = patched.replace('</body>', '  <script src="receipt-autofill.js"></script>\n</body>');
  }
  return patched;
}

async function indexShell(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const patched = new Response(patchIndexHtml(await res.text()), {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': 'text/html; charset=UTF-8' }
      });
      await cache.put(request, patched.clone());
      return patched;
    }
  } catch (e) {
    const cached = await cache.match(request) || await cache.match('./index.html') || await cache.match('./');
    if (cached) return cached;
  }
  throw new Error('offline');
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || network.then((res) => res || Promise.reject(new Error('offline')));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The page shell and the version marker must always try the network first,
  // otherwise a new deploy would never be noticed.
  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(indexShell(request));
    return;
  }

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
