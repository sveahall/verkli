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

const RETIRED_WORKER_VERSION = "v3-retired";

function verifyRetiredWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  return new Promise((resolve, reject) => {
    const observed = new Set<ServiceWorker>();
    const requested = new Set<ServiceWorker>();
    const channels: MessageChannel[] = [];
    const cleanup = () => {
      clearTimeout(timeout);
      registration.removeEventListener("updatefound", inspect);
      for (const worker of observed) worker.removeEventListener("statechange", inspect);
      for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Could not replace the old offline worker. Reconnect, close other Verkli tabs and reload to finish removing saved copies."));
    }, 15_000);
    function inspect() {
      for (const worker of [registration.installing, registration.waiting, registration.active]) {
        if (worker && !observed.has(worker)) {
          observed.add(worker);
          worker.addEventListener("statechange", inspect);
        }
      }
      const worker = registration.active;
      if (!worker || worker.state !== "activated" || requested.has(worker)) return;
      requested.add(worker);
      const channel = new MessageChannel();
      channels.push(channel);
      channel.port1.onmessage = (event: MessageEvent) => {
        // Old workers can acknowledge cache deletion too. Require this exact
        // cache-free worker's acknowledgement AFTER it has claimed all tabs.
        if (event.data?.ok !== true || event.data?.version !== RETIRED_WORKER_VERSION
          || registration.active !== worker || worker.state !== "activated") return;
        cleanup();
        resolve(worker);
      };
      try {
        worker.postMessage({ type: "OFFLINE_RETIRE" }, [channel.port2]);
      } catch {
        // An update may have made this worker redundant; inspect its successor.
      }
    }
    registration.addEventListener("updatefound", inspect);
    inspect();
  });
}

export async function retireOfflineServiceWorker(): Promise<void> {
  const serviceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null;
  const isVerkliWorker = (worker: ServiceWorker | null | undefined) =>
    Boolean(worker && worker.scriptURL === new URL("/sw.js", window.location.origin).href);
  let safeToDetach = false;
  try {
    if (serviceWorker) {
      const registrations = await serviceWorker.getRegistrations();
      const own = registrations.filter((registration) =>
        isVerkliWorker(registration.active) || isVerkliWorker(registration.waiting) || isVerkliWorker(registration.installing));
      const scopes = own.map((registration) => registration.scope);
      if (scopes.length === 0 && isVerkliWorker(serviceWorker.controller)) {
        // Recover tabs stranded by the earlier unregister-first cleanup.
        const scope = new URL("/", window.location.origin).href;
        if (registrations.some((registration) => registration.scope === scope)) {
          throw new Error("Another worker now owns this scope. Close other Verkli tabs and reload before removing saved copies.");
        }
        scopes.push(scope);
      }
      const retired: Array<{ registration: ServiceWorkerRegistration; worker: ServiceWorker }> = [];
      for (const scope of scopes) {
        const registration = await serviceWorker.register("/sw.js", { scope, updateViaCache: "none" });
        await registration.update();
        retired.push({ registration, worker: await verifyRetiredWorker(registration) });
      }
      // Never strand another tab with the old cache-writing controller. A
      // verified retirement worker first takes over every client in its scope.
      for (const { registration, worker } of retired) {
        if (registration.active !== worker) throw new Error("Offline worker changed during cleanup. Reload and try again.");
        await registration.unregister();
      }
    }
    safeToDetach = true;
    await Promise.all([clearAllOfflineContentUrls(), clearOfflineDatabase()]);
  } finally {
    // Other open tabs retain only the verified cache-free controller. Detach
    // this document too, even when an old tab blocks IndexedDB deletion.
    if (safeToDetach && isVerkliWorker(serviceWorker?.controller)) window.location.reload();
  }
}
