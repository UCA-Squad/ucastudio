let ver = 'v1::';

self.addEventListener('fetch', e => {
    if (!e.request.url.startsWith('http')) {
        return;
    }
    e.respondWith(
        caches.match(e.request).then(cache => {
        let fresh = fetch(e.request)
          .then(fetchAndUpdate, failedResponse)
          .catch(failedResponse);

        return fresh || cache;

        function fetchAndUpdate(res) {
            if (e.request.url.indexOf('socket.io') > -1) {
                return res;
            }

            if (!res || !res.ok) {
                return res;
            }

            let copy = res.clone();
            caches.open(ver + 'app')
            .then(cache => {
              cache.put(e.request, copy).catch(err => {
                  console.warn('Cache put failed:', err);
              });
            });

            return res;
        }

        function failedResponse() {
            if (e.request.url.includes('socket.io')) {
                return new Response('let io = (function() { return false })', {
                    headers: { 'Content-Type': 'application/javascript' }
                });
            }
            return cache || new Response('');
        }
      })
    )
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => {
                console.log('[Service Worker] Existing cache keys:', keys);
                return Promise.all(
                    keys
                        .filter(key => !key.startsWith(ver))
                        .map(key => {
                            console.log('[Service Worker] Deleting old cache:', key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => {
                console.log('[Service Worker] Cache cleanup complete.');
                return self.clients.claim(); // Optionnel : active immédiatement le SW sur les pages ouvertes
            })
            .catch(err => {
                console.error('[Service Worker] Cache cleanup failed:', err);
            })
    );
});
