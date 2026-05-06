/* global self, caches, fetch */

/**
 * Investor-pitch demo service worker. Separate from the production
 * /sw.js (which only runs offline reader mode and explicitly skips
 * localhost) — this one is the inverse: ONLY runs on localhost / *.local
 * pitch laptops, and pre-caches every demo asset so the demo flow can
 * survive a venue wifi outage.
 *
 * Two responsibilities:
 *   1. Pre-cache /demo-assets/* (covers, audio, social SVGs).
 *   2. Stale-while-revalidate /author/books/* and /reader/books/* so
 *      the two book pages paint instantly on navigation.
 */

const CACHE_VERSION = "demo-pitch-v1";
const PRECACHE_NAME = `${CACHE_VERSION}-precache`;
const RUNTIME_NAME = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  // Cover fallbacks
  "/demo-assets/covers/01.png",
  "/demo-assets/covers/02.png",
  "/demo-assets/covers/03.png",
  "/demo-assets/covers/04.png",
  // Audio narration (10 langs)
  "/demo-assets/audio/sv.mp3",
  "/demo-assets/audio/en.mp3",
  "/demo-assets/audio/de.mp3",
  "/demo-assets/audio/fr.mp3",
  "/demo-assets/audio/es.mp3",
  "/demo-assets/audio/it.mp3",
  "/demo-assets/audio/nl.mp3",
  "/demo-assets/audio/pt.mp3",
  "/demo-assets/audio/pl.mp3",
  "/demo-assets/audio/ja.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then((cache) =>
      // A missing trailer.mp4 / backup-video.mp4 (not yet recorded)
      // shouldn't fail the install. Add each URL individually with catch.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            // ignore individual misses
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("demo-pitch-") && k !== PRECACHE_NAME && k !== RUNTIME_NAME)
            .map((k) => caches.delete(k))
        )
      ),
      self.clients.claim(),
    ])
  );
});

function isDemoAssetRequest(url) {
  return url.pathname.startsWith("/demo-assets/");
}

function isBookPageRequest(url) {
  return (
    url.pathname.startsWith("/author/books/") ||
    url.pathname.startsWith("/reader/books/")
  );
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
    // Fire-and-forget revalidation in the background.
    networkPromise.catch(() => undefined);
    return cached;
  }
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (isDemoAssetRequest(url) || isBookPageRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_NAME));
  }
});
