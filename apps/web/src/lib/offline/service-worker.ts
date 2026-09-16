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
    throw new Error("Offline saving is not supported in this browser.");
  }

  let readyTimeout: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_resolve, reject) => {
      readyTimeout = setTimeout(() => reject(new Error("Offline storage is not ready. Reload the page and try again.")), 10_000);
    }),
  ]).finally(() => clearTimeout(readyTimeout));
  const worker = registration?.active ?? navigator.serviceWorker.controller;
  if (!worker) {
    throw new Error("Offline storage is not ready. Reload the page and try again.");
  }

  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      if (error) reject(error);
      else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error("Offline storage did not respond. Please try again.")), 60_000);

    channel.port1.onmessage = (event) => {
      finish(event.data?.ok === true ? undefined : new Error("Could not update offline storage. Check your connection and available device storage, then try again."));
    };

    try {
      worker.postMessage(command, [channel.port2]);
    } catch {
      finish(new Error("Could not contact offline storage. Reload the page and try again."));
    }
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
