const SW_VERSION = "v1";
const STATIC_CACHE = `verkli-static-${SW_VERSION}`;
const CONTENT_CACHE = `verkli-content-${SW_VERSION}`;

const APP_SHELL_URLS = ["/", "/reader", "/reader/discover"];

function isStaticAssetRequest(request, url) {
  if (request.destination === "script" || request.destination === "style" || request.destination === "font") {
    return true;
  }
  if (request.destination === "image") {
    return true;
  }
  return url.pathname.startsWith("/_next/static/");
}

function isReaderContentRequest(request, url) {
  if (request.mode === "navigate" && url.pathname.startsWith("/reader/")) {
    return true;
  }
  if (url.pathname.startsWith("/reader/books/") || url.pathname.startsWith("/reader/read/")) {
    return true;
  }
  if (url.pathname.startsWith("/api/offline/books/")) {
    return true;
  }
  return false;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw new Error("offline_cache_miss");
  }
}

async function cacheUrls(urls) {
  const cache = await caches.open(CONTENT_CACHE);

  await Promise.all(
    urls.map(async (urlValue) => {
      try {
        const request = new Request(urlValue, {
          method: "GET",
          credentials: "include",
        });
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response.clone());
        }
      } catch {
        // Ignore individual pre-cache failures; caller can retry later.
      }
    })
  );
}

async function deleteUrls(urls) {
  const cache = await caches.open(CONTENT_CACHE);
  await Promise.all(
    urls.map(async (urlValue) => {
      const request = new Request(urlValue, {
        method: "GET",
        credentials: "include",
      });
      await cache.delete(request);
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        APP_SHELL_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            // Ignore shell pre-cache misses; runtime caching still works.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const expected = new Set([STATIC_CACHE, CONTENT_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.map(async (name) => {
          if (!expected.has(name)) {
            await caches.delete(name);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isReaderContentRequest(request, url)) {
    event.respondWith(networkFirst(request, CONTENT_CACHE));
  }
});

self.addEventListener("message", (event) => {
  const payload = event.data;
  const replyPort = event.ports && event.ports[0] ? event.ports[0] : null;

  event.waitUntil(
    (async () => {
      try {
        if (!payload || typeof payload !== "object") {
          replyPort?.postMessage({ ok: false });
          return;
        }

        if (payload.type === "OFFLINE_CACHE_URLS" && Array.isArray(payload.urls)) {
          await cacheUrls(payload.urls);
          replyPort?.postMessage({ ok: true });
          return;
        }

        if (payload.type === "OFFLINE_DELETE_URLS" && Array.isArray(payload.urls)) {
          await deleteUrls(payload.urls);
          replyPort?.postMessage({ ok: true });
          return;
        }

        if (payload.type === "OFFLINE_CLEAR_ALL_CONTENT") {
          await caches.delete(CONTENT_CACHE);
          replyPort?.postMessage({ ok: true });
          return;
        }

        replyPort?.postMessage({ ok: false });
      } catch {
        replyPort?.postMessage({ ok: false });
      }
    })()
  );
});
