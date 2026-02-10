const DB_NAME = "verkli-offline";
const DB_VERSION = 1;

const STORE_MANIFESTS = "manifests";
const STORE_CHAPTERS = "chapters";
const STORE_BOOKMARKS = "bookmarks";
const STORE_HIGHLIGHTS = "highlights";

const INDEX_BY_USER = "by_user";
const INDEX_BY_USER_BOOK = "by_user_book";

function toManifestKey(userId: string, bookId: string, bookVersionId: string): string {
  return `${userId}:${bookId}:${bookVersionId}`;
}

function toChapterKey(userId: string, chapterId: string): string {
  return `${userId}:${chapterId}`;
}

function toUserBookKey(userId: string, bookId: string): string {
  return `${userId}:${bookId}`;
}

export type OfflineManifestRecord = {
  key: string;
  userId: string;
  userBookKey: string;
  bookId: string;
  bookVersionId: string;
  languageCode: string;
  manifestHash: string;
  chapterHashes: Record<string, string>;
  chapterReaderUrls: string[];
  bookUrl: string;
  chapterCount: number;
  savedAt: number;
  updatedAt: number;
};

export type OfflineChapterRecord = {
  key: string;
  userId: string;
  userBookKey: string;
  bookId: string;
  bookVersionId: string;
  chapterId: string;
  title: string;
  order: number;
  content: string;
  contentHash: string;
  readerUrl: string;
  updatedAt: number;
};

export type OfflineBookmarkRecord = {
  key: string;
  userId: string;
  userBookKey: string;
  bookId: string;
  bookmarkId: string;
  createdAt: string | null;
};

export type OfflineHighlightRecord = {
  key: string;
  userId: string;
  userBookKey: string;
  bookId: string;
  chapterId: string;
  text: string;
  color: string;
  createdAt: string;
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function ensureIndexedDbAvailable(): void {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment");
  }
}

async function openOfflineDb(): Promise<IDBDatabase> {
  ensureIndexedDbAvailable();
  const openRequest = indexedDB.open(DB_NAME, DB_VERSION);

  openRequest.onupgradeneeded = () => {
    const db = openRequest.result;

    if (!db.objectStoreNames.contains(STORE_MANIFESTS)) {
      const store = db.createObjectStore(STORE_MANIFESTS, { keyPath: "key" });
      store.createIndex(INDEX_BY_USER, "userId", { unique: false });
      store.createIndex(INDEX_BY_USER_BOOK, "userBookKey", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
      const store = db.createObjectStore(STORE_CHAPTERS, { keyPath: "key" });
      store.createIndex(INDEX_BY_USER, "userId", { unique: false });
      store.createIndex(INDEX_BY_USER_BOOK, "userBookKey", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
      const store = db.createObjectStore(STORE_BOOKMARKS, { keyPath: "key" });
      store.createIndex(INDEX_BY_USER, "userId", { unique: false });
      store.createIndex(INDEX_BY_USER_BOOK, "userBookKey", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORE_HIGHLIGHTS)) {
      const store = db.createObjectStore(STORE_HIGHLIGHTS, { keyPath: "key" });
      store.createIndex(INDEX_BY_USER, "userId", { unique: false });
      store.createIndex(INDEX_BY_USER_BOOK, "userBookKey", { unique: false });
    }
  };

  return requestToPromise(openRequest);
}

async function collectByIndex<T>(
  store: IDBObjectStore,
  indexName: string,
  value: string
): Promise<T[]> {
  const index = store.index(indexName);
  const request = index.getAll(IDBKeyRange.only(value));
  return (await requestToPromise(request)) as T[];
}

async function deleteByIndex(
  store: IDBObjectStore,
  indexName: string,
  value: string,
  shouldDelete?: (entry: Record<string, unknown>) => boolean
): Promise<void> {
  const index = store.index(indexName);
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = index.openCursor(IDBKeyRange.only(value));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }

      const candidate = cursor.value as Record<string, unknown>;
      if (!shouldDelete || shouldDelete(candidate)) {
        cursor.delete();
      }
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("IndexedDB cursor failed"));
  });
}

export async function getOfflineManifestForBook(
  userId: string,
  bookId: string
): Promise<OfflineManifestRecord | null> {
  const db = await openOfflineDb();
  const transaction = db.transaction(STORE_MANIFESTS, "readonly");
  const store = transaction.objectStore(STORE_MANIFESTS);
  const manifests = await collectByIndex<OfflineManifestRecord>(
    store,
    INDEX_BY_USER_BOOK,
    toUserBookKey(userId, bookId)
  );
  await transactionToPromise(transaction);

  if (manifests.length === 0) {
    return null;
  }

  manifests.sort((a, b) => b.updatedAt - a.updatedAt);
  return manifests[0];
}

export async function hasOfflineBook(userId: string, bookId: string): Promise<boolean> {
  const manifest = await getOfflineManifestForBook(userId, bookId);
  return Boolean(manifest);
}

export async function saveOfflineManifest(
  record: Omit<OfflineManifestRecord, "key" | "userBookKey" | "savedAt" | "updatedAt"> & {
    savedAt?: number;
    updatedAt?: number;
  }
): Promise<void> {
  const db = await openOfflineDb();
  const transaction = db.transaction(STORE_MANIFESTS, "readwrite");
  const store = transaction.objectStore(STORE_MANIFESTS);
  const savedAt = record.savedAt ?? Date.now();
  const updatedAt = record.updatedAt ?? Date.now();

  store.put({
    ...record,
    key: toManifestKey(record.userId, record.bookId, record.bookVersionId),
    userBookKey: toUserBookKey(record.userId, record.bookId),
    savedAt,
    updatedAt,
  } satisfies OfflineManifestRecord);

  await transactionToPromise(transaction);
}

export async function upsertOfflineChapters(
  chapters: Array<Omit<OfflineChapterRecord, "key" | "userBookKey">>
): Promise<void> {
  if (chapters.length === 0) return;

  const db = await openOfflineDb();
  const transaction = db.transaction(STORE_CHAPTERS, "readwrite");
  const store = transaction.objectStore(STORE_CHAPTERS);

  for (const chapter of chapters) {
    store.put({
      ...chapter,
      key: toChapterKey(chapter.userId, chapter.chapterId),
      userBookKey: toUserBookKey(chapter.userId, chapter.bookId),
    } satisfies OfflineChapterRecord);
  }

  await transactionToPromise(transaction);
}

export async function pruneOfflineChaptersForBook(
  userId: string,
  bookId: string,
  keepChapterIds: string[]
): Promise<void> {
  const keep = new Set(keepChapterIds);
  const db = await openOfflineDb();
  const transaction = db.transaction(STORE_CHAPTERS, "readwrite");
  const store = transaction.objectStore(STORE_CHAPTERS);

  await deleteByIndex(store, INDEX_BY_USER_BOOK, toUserBookKey(userId, bookId), (entry) => {
    const chapterId = String(entry.chapterId ?? "");
    return !keep.has(chapterId);
  });

  await transactionToPromise(transaction);
}

export async function putOfflineBookmarks(
  userId: string,
  bookId: string,
  bookmarks: Array<{ id: string; created_at?: string | null }>
): Promise<void> {
  const db = await openOfflineDb();
  const transaction = db.transaction(STORE_BOOKMARKS, "readwrite");
  const store = transaction.objectStore(STORE_BOOKMARKS);

  await deleteByIndex(store, INDEX_BY_USER_BOOK, toUserBookKey(userId, bookId));

  for (const bookmark of bookmarks) {
    store.put({
      key: `${userId}:${bookmark.id}`,
      userId,
      userBookKey: toUserBookKey(userId, bookId),
      bookId,
      bookmarkId: bookmark.id,
      createdAt: bookmark.created_at ?? null,
    } satisfies OfflineBookmarkRecord);
  }

  await transactionToPromise(transaction);
}

export async function removeOfflineBook(userId: string, bookId: string): Promise<void> {
  const db = await openOfflineDb();
  const userBookKey = toUserBookKey(userId, bookId);

  for (const storeName of [STORE_MANIFESTS, STORE_CHAPTERS, STORE_BOOKMARKS, STORE_HIGHLIGHTS]) {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    await deleteByIndex(store, INDEX_BY_USER_BOOK, userBookKey);
    await transactionToPromise(transaction);
  }
}

export async function clearOfflineForUser(userId: string): Promise<void> {
  const db = await openOfflineDb();

  for (const storeName of [STORE_MANIFESTS, STORE_CHAPTERS, STORE_BOOKMARKS, STORE_HIGHLIGHTS]) {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    await deleteByIndex(store, INDEX_BY_USER, userId);
    await transactionToPromise(transaction);
  }
}

export async function getOfflineChapter(
  userId: string,
  chapterId: string
): Promise<OfflineChapterRecord | null> {
  const db = await openOfflineDb();
  const transaction = db.transaction(STORE_CHAPTERS, "readonly");
  const store = transaction.objectStore(STORE_CHAPTERS);
  const request = store.get(toChapterKey(userId, chapterId));
  const result = (await requestToPromise(request)) as OfflineChapterRecord | undefined;
  await transactionToPromise(transaction);
  return result ?? null;
}
