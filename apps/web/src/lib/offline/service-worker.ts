import { OFFLINE_UNAVAILABLE_MESSAGE } from "./availability";
import { clearOfflineDatabase } from "./idb";

export async function cacheOfflineUrls(urls: string[]): Promise<void> {
  void urls;
  // Do not contact an old controller: it could still acknowledge an unsafe save.
  throw new Error(OFFLINE_UNAVAILABLE_MESSAGE);
}

export async function clearOfflineUrls(urls: string[]): Promise<void> {
  void urls;
  await clearAllOfflineContentUrls();
}

export async function clearAllOfflineContentUrls(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith("verkli-content-") || name.startsWith("verkli-static-"))
    .map((name) => caches.delete(name)));
}

export async function retireOfflineServiceWorker(): Promise<void> {
  const serviceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null;
  const isVerkliWorker = (worker: ServiceWorker | null | undefined) =>
    Boolean(worker && worker.scriptURL === new URL("/sw.js", window.location.origin).href);
  const wasControlled = isVerkliWorker(serviceWorker?.controller);
  let unregistered = false;
  try {
    if (serviceWorker) {
      const registrations = await serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter((registration) => isVerkliWorker(registration.active) || isVerkliWorker(registration.waiting) || isVerkliWorker(registration.installing))
        .map((registration) => registration.unregister()));
    }
    unregistered = true;
    await Promise.all([clearAllOfflineContentUrls(), clearOfflineDatabase()]);
  } finally {
    // Unregistering alone leaves the old worker controlling this document.
    // A reload detaches it, including when an old tab blocks IndexedDB deletion.
    if (wasControlled && unregistered) window.location.reload();
  }
}
