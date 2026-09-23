/* global self, caches, fetch */

/**
 * Investor-pitch demo service worker. Separate from the production
 * /sw.js (which only runs offline reader mode and explicitly skips
 * localhost) — this one is the inverse: ONLY runs on localhost / *.local
 * pitch laptops, and pre-caches every demo asset so the demo flow can
 * survive a venue wifi outage.
 *
 *   1. Pre-cache /demo-assets/* (covers, audio, social SVGs).
 *   2. Stale-while-revalidate /author/books/* and /reader/books/* so
 *      the two book pages paint instantly on navigation.
 */

const CACHE_VERSION = "demo-pitch-v3";
const PRECACHE_NAME = `${CACHE_VERSION}-precache`;
const RUNTIME_NAME = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  // Cover fallbacks (current asset format is .jpg)
  "/demo-assets/covers/01.jpg",
  "/demo-assets/covers/02.jpg",
  "/demo-assets/covers/03.jpg",
  "/demo-assets/covers/04.jpg",
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
  // Social thumbnails (3 langs × 5 channels) — distribution grid. Without
  // these the grid breaks offline if it hasn't been viewed online first.
  "/demo-assets/social/sv-instagram.svg",
  "/demo-assets/social/sv-threads.svg",
  "/demo-assets/social/sv-tiktok.svg",
  "/demo-assets/social/sv-x.svg",
  "/demo-assets/social/sv-youtube.svg",
  "/demo-assets/social/en-instagram.svg",
  "/demo-assets/social/en-threads.svg",
  "/demo-assets/social/en-tiktok.svg",
  "/demo-assets/social/en-x.svg",
  "/demo-assets/social/en-youtube.svg",
  "/demo-assets/social/fr-instagram.svg",
  "/demo-assets/social/fr-threads.svg",
  "/demo-assets/social/fr-tiktok.svg",
  "/demo-assets/social/fr-x.svg",
  "/demo-assets/social/fr-youtube.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then((cache) =>
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
  // Serve from the runtime cache first, then fall back to the install-time
  // precache specifically — otherwise precached demo assets are never served
  // offline, since they live in a different cache. Scope the fallback to the
  // demo precache (NOT a global caches.match) so we never serve a stale
  // /reader/books/* page out of the production reader cache.
  const precache = await caches.open(PRECACHE_NAME);
  const cached = (await cache.match(request)) || (await precache.match(request));
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
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
