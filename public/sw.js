const CACHE_NAME = 'sanketsetu-shell-v2';
const STATIC_ASSET_PATTERN = /\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|ico)$/i;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        await cache.addAll(['/', '/manifest.json']);
        const indexResponse = await fetch('/index.html', { cache: 'no-store' });
        if (!indexResponse.ok) throw new Error(`Could not cache app shell: HTTP ${indexResponse.status}`);
        const html = await indexResponse.clone().text();
        await cache.put('/index.html', indexResponse);

        const assetPaths = Array.from(
          html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|woff2?|ttf)(?:\?[^"]*)?)"/g),
          match => match[1]
        );
        const assetUrls = Array.from(new Set(assetPaths))
          .map(path => new URL(path, self.location.origin))
          .filter(url => url.origin === self.location.origin);
        const cssTexts = [];
        await Promise.all(assetUrls.map(async url => {
          const response = await fetch(url.href, { cache: 'no-store' });
          if (!response.ok) throw new Error(`Could not cache app asset ${url.pathname}: HTTP ${response.status}`);
          await cache.put(url.href, response.clone());
          if (url.pathname.endsWith('.css')) cssTexts.push(await response.text());
        }));

        const cssAssetPaths = cssTexts.flatMap(css =>
          Array.from(css.matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/g), match => match[1])
        );
        const cssAssetUrls = Array.from(new Set(cssAssetPaths))
          .filter(path => !path.startsWith('data:'))
          .map(path => new URL(path, self.location.origin))
          .filter(url => url.origin === self.location.origin);
        await Promise.all(cssAssetUrls.map(async url => {
          const response = await fetch(url.href, { cache: 'no-store' });
          if (!response.ok) throw new Error(`Could not cache app style asset ${url.pathname}: HTTP ${response.status}`);
          await cache.put(url.href, response);
        }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('sanketsetu-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || Response.error())
    );
    return;
  }

  if (request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'font' ||
      STATIC_ASSET_PATTERN.test(requestUrl.pathname)) {
    event.respondWith(
      caches.match(request)
        .then(cached => cached || fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        }))
        .catch(() => Response.error())
    );
  }
});
