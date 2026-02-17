"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBillingState } from "@/hooks/useBillingState";
import { resolveErrorMessage } from "@/lib/error-messages";
import { getOfflineReadingEnabled } from "@/lib/flags";
import {
  clearOfflineForUser,
  getOfflineManifestForBook,
  hasOfflineBook,
  pruneOfflineChaptersForBook,
  putOfflineBookmarks,
  removeOfflineBook,
  saveOfflineManifest,
  upsertOfflineChapters,
} from "@/lib/offline/idb";
import {
  cacheOfflineUrls,
  clearAllOfflineContentUrls,
  clearOfflineUrls,
} from "@/lib/offline/service-worker";
import type { OfflineChaptersResponse, OfflineManifestResponse } from "@/lib/offline/types";

const CHAPTER_BATCH_SIZE = 20;

type Props = {
  bookId: string;
  userId: string;
  languageCode: string;
};

type BookmarkRow = {
  id: string;
  book_id: string;
  created_at?: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T;
  return body;
}

async function syncBookmarksSnapshot(userId: string, bookId: string): Promise<void> {
  const response = await fetch("/api/bookmarks", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return;

  const body = await readJson<{ bookmarks?: BookmarkRow[] }>(response);
  const bookmarks = (body.bookmarks ?? []).filter((bookmark) => bookmark.book_id === bookId);
  await putOfflineBookmarks(userId, bookId, bookmarks);
}

export default function OfflineSaveButton({ bookId, userId, languageCode }: Props) {
  const offlineEnabled = useMemo(() => getOfflineReadingEnabled(), []);
  const { isPlusActive, loading: billingLoading } = useBillingState();

  const [isSaved, setIsSaved] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const refreshSavedState = useCallback(async () => {
    try {
      const saved = await hasOfflineBook(userId, bookId);
      setIsSaved(saved);
    } catch {
      // Non-fatal; UI remains interactive.
    }
  }, [userId, bookId]);

  useEffect(() => {
    if (!offlineEnabled) return;
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, [offlineEnabled]);

  useEffect(() => {
    if (!offlineEnabled) return;
    void refreshSavedState();
  }, [offlineEnabled, refreshSavedState]);

  const saveOffline = useCallback(async () => {
    setIsBusy(true);
    setProgress(2);
    setErrorText(null);
    setStatusText("Fetching offline manifest...");

    try {
      const manifestResponse = await fetch(
        `/api/offline/books/${bookId}/manifest?lang=${encodeURIComponent(languageCode)}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );
      const manifestBody = await readJson<OfflineManifestResponse & { error?: string }>(manifestResponse);
      if (!manifestResponse.ok) {
        throw new Error(resolveErrorMessage(manifestBody.error ?? null));
      }
      const manifest = manifestBody as OfflineManifestResponse;

      const previousManifest = await getOfflineManifestForBook(userId, bookId);
      const previousHashes = previousManifest?.chapterHashes ?? {};
      const chaptersToFetch = manifest.chapters.filter(
        (chapter) => previousHashes[chapter.id] !== chapter.contentHash
      );
      const chapterBatches = chunk(chaptersToFetch, CHAPTER_BATCH_SIZE);

      setProgress(10);

      let fetched = 0;
      for (const batch of chapterBatches) {
        setStatusText(
          `Loading chapters ${Math.min(fetched + 1, chaptersToFetch.length)}-${Math.min(
            fetched + batch.length,
            chaptersToFetch.length
          )} of ${chaptersToFetch.length}...`
        );

        const chapterResponse = await fetch(manifest.chapterBatchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            bookVersionId: manifest.bookVersionId,
            chapterIds: batch.map((chapter) => chapter.id),
          }),
        });
        const chapterBody = await readJson<OfflineChaptersResponse & { error?: string }>(chapterResponse);
        if (!chapterResponse.ok) {
          throw new Error(resolveErrorMessage(chapterBody.error ?? null));
        }

        const chapterPayload = chapterBody as OfflineChaptersResponse;
        await upsertOfflineChapters(
          chapterPayload.chapters.map((chapter) => ({
            userId,
            bookId: manifest.bookId,
            bookVersionId: manifest.bookVersionId,
            chapterId: chapter.id,
            title: chapter.title,
            order: chapter.order,
            content: chapter.content,
            contentHash: chapter.contentHash,
            readerUrl: chapter.readerUrl,
            updatedAt: chapter.updatedAt ? Date.parse(chapter.updatedAt) : Date.now(),
          }))
        );

        fetched += batch.length;
        const progressPercent =
          chaptersToFetch.length === 0
            ? 80
            : 10 + Math.round((fetched / chaptersToFetch.length) * 70);
        setProgress(Math.min(85, progressPercent));
      }

      setStatusText("Syncing offline data...");
      await pruneOfflineChaptersForBook(
        userId,
        manifest.bookId,
        manifest.chapters.map((chapter) => chapter.id)
      );
      await saveOfflineManifest({
        userId,
        bookId: manifest.bookId,
        bookVersionId: manifest.bookVersionId,
        languageCode: manifest.languageCode,
        manifestHash: manifest.manifestHash,
        chapterHashes: Object.fromEntries(
          manifest.chapters.map((chapter) => [chapter.id, chapter.contentHash])
        ),
        chapterReaderUrls: manifest.chapters.map((chapter) => chapter.readerUrl),
        bookUrl: manifest.bookUrl,
        chapterCount: manifest.chapters.length,
        updatedAt: Date.now(),
      });
      await syncBookmarksSnapshot(userId, manifest.bookId);

      const nextUrls = [manifest.bookUrl, ...manifest.chapters.map((chapter) => chapter.readerUrl)];
      const staleUrls = (previousManifest?.chapterReaderUrls ?? []).filter((url) => !nextUrls.includes(url));
      if (staleUrls.length > 0) {
        await clearOfflineUrls(staleUrls);
      }
      await cacheOfflineUrls(nextUrls);

      setProgress(100);
      setStatusText("Saved offline");
      setIsSaved(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : resolveErrorMessage(null);
      setErrorText(message);
      setStatusText(null);
    } finally {
      setIsBusy(false);
      setTimeout(() => {
        setProgress(0);
      }, 1000);
    }
  }, [bookId, languageCode, userId]);

  const removeBookOffline = useCallback(async () => {
    setIsBusy(true);
    setErrorText(null);
    setStatusText("Clearing offline data...");
    try {
      const existingManifest = await getOfflineManifestForBook(userId, bookId);
      await removeOfflineBook(userId, bookId);
      if (existingManifest) {
        await clearOfflineUrls([existingManifest.bookUrl, ...existingManifest.chapterReaderUrls]);
      }
      setIsSaved(false);
      setStatusText("Offline data removed");
    } catch {
      setErrorText("Could not clear offline data for this book.");
      setStatusText(null);
    } finally {
      setIsBusy(false);
    }
  }, [bookId, userId]);

  const clearAllOffline = useCallback(async () => {
    setIsBusy(true);
    setErrorText(null);
    setStatusText("Clearing all offline data...");
    try {
      await clearOfflineForUser(userId);
      await clearAllOfflineContentUrls();
      setIsSaved(false);
      setStatusText("All offline data cleared");
    } catch {
      setErrorText("Could not clear all offline data.");
      setStatusText(null);
    } finally {
      setIsBusy(false);
    }
  }, [userId]);

  if (!offlineEnabled) {
    return null;
  }

  if (billingLoading) {
    return (
      <button
        type="button"
        disabled
        className="rounded-full border border-slate-300 bg-slate-200 px-6 py-3 text-[14px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-white/60"
      >
        Checking Plus...
      </button>
    );
  }

  if (!isPlusActive) {
    return (
      <div className="max-w-md rounded-xl border border-[#907AFF]/20 bg-[#907AFF]/5 px-4 py-3 text-sm text-slate-700 dark:text-white/80">
        <p className="font-semibold text-slate-900 dark:text-white">Offline reading is included in Verkli Plus.</p>
        <p className="mt-1 text-slate-600 dark:text-white/70">Upgrade to save books and read without a connection.</p>
        <Link
          href="/reader/billing"
          className="mt-3 inline-flex items-center rounded-lg bg-[#907AFF]/15 px-3 py-1.5 text-[13px] font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/25 dark:text-[#B8A9FF] dark:hover:bg-[#907AFF]/20"
        >
          Upgrade to Plus
        </Link>
      </div>
    );
  }

  const saveButtonLabel = isSaved ? "Update offline copy" : "Save offline";
  const cannotSave = isBusy || !isOnline;

  return (
    <div className="min-w-[220px]">
      <button
        type="button"
        onClick={() => void saveOffline()}
        disabled={cannotSave}
        className="rounded-full border border-slate-300 bg-white px-6 py-3 text-[14px] font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
      >
        {cannotSave && !isOnline ? "Currently offline" : saveButtonLabel}
      </button>

      {(isBusy || progress > 0) && (
        <div className="mt-3 w-full rounded-full border border-black/10 bg-black/[0.04] p-1 dark:border-white/10 dark:bg-white/[0.06]">
          <div
            className="h-1.5 rounded-full bg-[#907AFF] transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}

      {statusText && (
        <p className="mt-2 text-[12px] text-slate-600 dark:text-white/70">
          {statusText}
        </p>
      )}
      {errorText && (
        <p className="mt-2 text-[12px] text-rose-700 dark:text-rose-300">
          {errorText}
        </p>
      )}
      {!isOnline && isSaved && (
        <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-300">
          You are offline. Saved chapters can be read without a connection.
        </p>
      )}

      {isSaved && (
        <div className="mt-3 flex gap-2 text-[12px]">
          <button
            type="button"
            onClick={() => void removeBookOffline()}
            disabled={isBusy}
            className="rounded-full border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:bg-white/10"
          >
            Clear this book
          </button>
          <button
            type="button"
            onClick={() => void clearAllOffline()}
            disabled={isBusy}
            className="rounded-full border border-rose-400/50 px-3 py-1.5 font-medium text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-60 dark:text-rose-300"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
