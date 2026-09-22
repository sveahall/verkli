import { hashOfflineText, OFFLINE_AUDIENCE, verifyOfflineLease, type OfflineLease, type SignedOfflineLease } from "./lease";

export type OfflineOwner = { userId: string | null; generation: string };
export type OfflineDownload = { lease: SignedOfflineLease; chapters: Array<{ id: string; text: string }> };
export type OfflineState = OfflineOwner & { lastSeenAt: number; books: Record<string, OfflineDownload> };
export interface OfflineStorage {
  // A separate durable denial survives a failed IndexedDB cleanup transaction.
  invalidate(owner: OfflineOwner): void;
  isInvalidated(owner: OfflineOwner): boolean;
  // The callback must be synchronous and run in one read/write transaction.
  atomic<T>(update: (state: OfflineState) => T): Promise<T>;
}
export function emptyOfflineState(): OfflineState {
  return { userId: null, generation: crypto.randomUUID(), lastSeenAt: 0, books: {} };
}
const bookKey = (bookId: string, editionId: string) => JSON.stringify([bookId, editionId]);
const sameOwner = (state: OfflineOwner, owner: OfflineOwner) => Boolean(owner.userId)
  && state.userId === owner.userId && state.generation === owner.generation;

/** Unconnected to production. activateOwner is an integration boundary: a real
 * caller must authenticate the new owner ONLINE first; an offline caller can
 * only restore context(), not choose an identity. */
export class OwnedOfflineStore {
  private denied = new Set<string>();

  invalidate(owner: OfflineOwner): void {
    this.denied.add(owner.generation);
    this.storage.invalidate(owner);
  }

  private isInvalidated(owner: OfflineOwner): boolean {
    return this.denied.has(owner.generation) || this.storage.isInvalidated(owner);
  }
  constructor(
    private storage: OfflineStorage,
    private publicKey: CryptoKey,
    private now = () => Date.now(),
    private audience: OfflineLease["audience"] = OFFLINE_AUDIENCE,
  ) {}

  async activateOwner(userId: string | null): Promise<OfflineOwner> {
    return this.storage.atomic((state) => {
      if (state.userId) this.invalidate(state);
      const next = emptyOfflineState();
      // Fail closed if the durable denial store itself is unavailable.
      this.storage.isInvalidated(next);
      Object.assign(state, next, { userId, lastSeenAt: this.now() });
      return { userId: state.userId, generation: state.generation };
    });
  }

  private async checked<T>(owner: OfflineOwner | null, read: (state: OfflineState) => T): Promise<T> {
    const result = await this.storage.atomic((state) => {
      if (state.userId && this.isInvalidated(state)) return { error: "Offline account access is blocked. Reconnect and select the account again." };
      const now = this.now();
      if (!Number.isSafeInteger(now) || now < state.lastSeenAt) {
        Object.assign(state, emptyOfflineState());
        return { error: "Device clock changed. Reconnect to verify access." };
      }
      state.lastSeenAt = now;
      if (owner && !sameOwner(state, owner)) return { error: "Offline account changed. Reconnect to verify access." };
      return { value: read(state) };
    });
    if ("error" in result) throw new Error(result.error);
    return result.value;
  }

  async context(): Promise<OfflineOwner> {
    return this.checked(null, (state) => ({ userId: state.userId, generation: state.generation }));
  }

  private async validate(owner: OfflineOwner, book: OfflineDownload): Promise<OfflineLease> {
    const lease = await verifyOfflineLease(this.publicKey, book.lease, owner.userId ?? "", this.now(), this.audience);
    if (book.chapters.length !== lease.chapters.length
      || new Set(book.chapters.map((chapter) => chapter.id)).size !== lease.chapters.length) {
      throw new Error("Offline download is not complete. Retry while connected.");
    }
    for (const chapter of book.chapters) {
      const grant = lease.chapters.find((entry) => entry.id === chapter.id);
      if (!grant || await hashOfflineText(chapter.text) !== grant.hash) {
        throw new Error("Offline chapter does not match the approved version. Download it again.");
      }
    }
    return lease;
  }

  async save(owner: OfflineOwner, download: OfflineDownload): Promise<void> {
    const copy = structuredClone(download);
    const lease = await this.validate(owner, copy);
    // Ownership is checked AFTER asynchronous verification, inside the write.
    await this.checked(owner, (state) => {
      if (this.now() >= lease.expiresAt) throw new Error("Offline access expired. Reconnect to verify access.");
      state.books[bookKey(lease.bookId, lease.editionId)] = copy;
    });
  }

  async read(owner: OfflineOwner, bookId: string, editionId: string): Promise<OfflineDownload["chapters"] | null> {
    const key = bookKey(bookId, editionId);
    const book = await this.checked(owner, (state) => structuredClone(state.books[key] ?? null));
    if (!book) return null;
    const lease = await this.validate(owner, book);
    if (lease.bookId !== bookId || lease.editionId !== editionId) throw new Error("Offline edition does not match.");
    return this.checked(owner, (state) => {
      if (this.now() >= lease.expiresAt) throw new Error("Offline access expired. Reconnect to verify access.");
      const current = state.books[key];
      if (!current || current.lease.signature !== book.lease.signature) throw new Error("Offline copy changed. Open it again.");
      return book.chapters;
    });
  }

  /** Invoke immediately on an authenticated 401/403/revocation response. A
   * delayed response from an old account must never clear the new account. */
  async revoke(owner: OfflineOwner): Promise<void> {
    this.invalidate(owner);
    await this.storage.atomic((state) => {
      if (sameOwner(state, owner)) Object.assign(state, emptyOfflineState());
    });
  }
}

/** Dedicated database only: never shares or revives legacy verkli-offline.
 * Persisted text is plaintext, not a DRM or shared-device-unlock mechanism. */
export function createIndexedDbOfflineStorage(databaseName: string): OfflineStorage {
  if (!databaseName.startsWith("verkli-offline-owned-")) throw new Error("Use a dedicated owned offline database.");
  return {
    invalidate(owner) {
      localStorage.setItem(`${databaseName}:denied:${owner.generation}`, "1");
    },
    isInvalidated(owner) {
      return localStorage.getItem(`${databaseName}:denied:${owner.generation}`) !== null;
    },
    async atomic<T>(update: (state: OfflineState) => T): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        let blocked = false;
        request.onupgradeneeded = () => request.result.createObjectStore("state");
        request.onerror = () => reject(new Error("Could not open offline storage."));
        request.onblocked = () => {
          blocked = true;
          reject(new Error("Offline storage is blocked. Close other Verkli tabs and retry."));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) { db.close(); return; }
          db.onversionchange = () => db.close();
          const transaction = db.transaction("state", "readwrite");
          const store = transaction.objectStore("state");
          const read = store.get("owner");
          let result: T;
          let failure: unknown;
          read.onsuccess = () => {
            try {
              const state: OfflineState = read.result ?? emptyOfflineState();
              result = update(state);
              store.put(state, "owner");
            } catch (error) { failure = error; transaction.abort(); }
          };
          transaction.oncomplete = () => { db.close(); resolve(result); };
          transaction.onabort = () => {
            db.close();
            reject(failure ?? new Error("Could not save offline storage. Check available space and retry."));
          };
          transaction.onerror = () => { /* onabort reports failure, never success */ };
        };
      });
    },
  };
}
