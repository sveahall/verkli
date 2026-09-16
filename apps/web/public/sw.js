const SW_VERSION = "v3-retired";
// The old URL caches mixed authenticated HTML across users.
// Intentionally no fetch handler or app-shell precache: all content needs network.
async function purgeLegacyCaches() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith("verkli-content-") || name.startsWith("verkli-static-"))
    .map((name) => caches.delete(name)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await purgeLegacyCaches();
  })());
});

self.addEventListener("message", (event) => {
  const replyPort = event.ports?.[0];
  event.waitUntil((async () => {
    try {
      if (event.data?.type === "OFFLINE_RETIRE") {
        // Claim every open tab BEFORE allowing the page to unregister us.
        // Otherwise another tab can retain the old cache-writing controller.
        await self.clients.claim();
        await purgeLegacyCaches();
        replyPort?.postMessage({ ok: true, version: SW_VERSION });
        return;
      }
      if (event.data?.type === "OFFLINE_CLEAR_ALL_CONTENT" || event.data?.type === "OFFLINE_DELETE_URLS") {
        await purgeLegacyCaches();
        replyPort?.postMessage({ ok: true });
        return;
      }
      // Older tabs must never receive a successful save acknowledgement.
      replyPort?.postMessage({ ok: false });
    } catch {
      replyPort?.postMessage({ ok: false });
    }
  })());
});
