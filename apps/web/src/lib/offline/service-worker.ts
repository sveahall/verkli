type ServiceWorkerCommand =
  | { type: "OFFLINE_CACHE_URLS"; urls: string[] }
  | { type: "OFFLINE_DELETE_URLS"; urls: string[] }
  | { type: "OFFLINE_CLEAR_ALL_CONTENT" };

function normalizeUrls(urls: string[]): string[] {
  const unique = new Set<string>();
  for (const value of urls) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    const normalized = trimmed.startsWith("http")
      ? new URL(trimmed).toString()
      : new URL(trimmed, window.location.origin).toString();
    unique.add(normalized);
  }
  return Array.from(unique);
}

async function postCommand(command: ServiceWorkerCommand): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const worker = registration?.active ?? navigator.serviceWorker.controller;
  if (!worker) {
    return;
  }

  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(), 5000);

    channel.port1.onmessage = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    worker.postMessage(command, [channel.port2]);
  });
}

export async function cacheOfflineUrls(urls: string[]): Promise<void> {
  const normalized = normalizeUrls(urls);
  if (normalized.length === 0) return;
  await postCommand({ type: "OFFLINE_CACHE_URLS", urls: normalized });
}

export async function clearOfflineUrls(urls: string[]): Promise<void> {
  const normalized = normalizeUrls(urls);
  if (normalized.length === 0) return;
  await postCommand({ type: "OFFLINE_DELETE_URLS", urls: normalized });
}

export async function clearAllOfflineContentUrls(): Promise<void> {
  await postCommand({ type: "OFFLINE_CLEAR_ALL_CONTENT" });
}
