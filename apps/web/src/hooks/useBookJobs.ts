"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { resolveErrorMessage } from "@/lib/error-messages";
import type { JobStatus } from "@/lib/job-status";

/* ─── Types matching GET /api/books/:id/jobs response ─────────────────────── */

export type JobKind = "import" | "translation" | "audiobook";

export type UnifiedJob = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  language: string | null;
  bookVersionId: string | null;
  progress: number;
  meta: Record<string, unknown>;
  error: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

type JobsApiResponse = {
  bookId: string;
  jobs: UnifiedJob[];
  activeCount: number;
  summary: Record<string, JobStatus>;
};

/* ─── Legacy types (backward compat for BookEditor) ───────────────────────── */

export type BookJobResponse = {
  job: {
    id: string;
    status: JobStatus;
    totalChapters?: number;
    completedChapters?: number;
    currentChapterId?: string | null;
    currentChapterTitle?: string | null;
    audioUrl?: string | null;
    manifestUrl?: string | null;
    durationSeconds?: number | null;
    error?: string | null;
    createdAt?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  } | null;
  bookStatus?: string | null;
  asset?: unknown;
} | null;

type LegacyJob = NonNullable<NonNullable<BookJobResponse>["job"]>;

/** Convert a unified audiobook job to the legacy shape used by BookEditor */
function toLegacyJob(j: UnifiedJob): LegacyJob {
  const meta = j.meta as Record<string, unknown>;
  return {
    id: j.id,
    status: j.status,
    totalChapters: (meta.totalChapters as number) ?? undefined,
    completedChapters: (meta.completedChapters as number) ?? undefined,
    currentChapterId: undefined,
    currentChapterTitle: (meta.currentChapterTitle as string) ?? undefined,
    audioUrl: (meta.audioUrl as string) ?? undefined,
    manifestUrl: (meta.manifestUrl as string) ?? undefined,
    durationSeconds: (meta.durationSeconds as number) ?? undefined,
    error: j.error ?? undefined,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}

/* ─── Hook options & result ────────────────────────────────────────────────── */

export type UseBookJobsOpts = {
  /** Polling interval in ms when there are active jobs (default 5000) */
  pollIntervalMs?: number;
};

export type UseBookJobsResult = {
  /** All jobs for this book (all kinds, most recent first) */
  jobs: UnifiedJob[];
  /** Number of pending/running jobs */
  activeCount: number;
  /** Latest status per kind (e.g. { audiobook: "running", translation: "completed" }) */
  summary: Record<string, JobStatus>;
  /** True once when activeCount transitions from >0 to 0 (jobs finished) */
  settled: boolean;
  /** Legacy: latest audiobook job in old shape (backward compat for BookEditor) */
  job: LegacyJob | null;
  /** Legacy: wrapped response for backward compat */
  data: BookJobResponse;
  loading: boolean;
  error: string | null;
  /** True when loaded and no jobs exist */
  empty: boolean;
  /** Manual refetch (e.g. after starting a new job) */
  refetch: () => Promise<void>;
};

const DEFAULT_POLL_MS = 5000;

/**
 * Fetches all job statuses for a book via GET /api/books/[bookId]/jobs.
 * Auto-polls when activeCount > 0. Exposes `settled` when all jobs finish.
 */
export function useBookJobs(
  bookId: string | null,
  opts?: UseBookJobsOpts
): UseBookJobsResult {
  const pollMs = opts?.pollIntervalMs ?? DEFAULT_POLL_MS;

  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [summary, setSummary] = useState<Record<string, JobStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const prevActiveRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchJobs = useCallback(async () => {
    if (!bookId) {
      setJobs([]);
      setActiveCount(0);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      const res = await fetch(`/api/books/${bookId}/jobs`);

      if (!res.ok) {
        // 403/404/500 — don't crash, just return empty
        if (res.status === 403) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[useBookJobs] 403 for bookId=%s (feature disabled or not author)", bookId);
          }
        } else {
          const json = await res.json().catch(() => ({}));
          setError(resolveErrorMessage(json?.error, "Kunde inte hämta status."));
        }
        setJobs([]);
        setActiveCount(0);
        return;
      }

      const data: JobsApiResponse = await res.json();
      if (!mountedRef.current) return;

      setJobs(data.jobs ?? []);
      setActiveCount(data.activeCount ?? 0);
      setSummary(data.summary ?? {});
      setError(null);

      // Detect transition: was active → now settled
      if (prevActiveRef.current > 0 && (data.activeCount ?? 0) === 0) {
        setSettled(true);
      }
      prevActiveRef.current = data.activeCount ?? 0;
    } catch {
      if (!mountedRef.current) return;
      setJobs([]);
      setActiveCount(0);
      setError("Nätverksfel");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [bookId]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    setSettled(false);
    prevActiveRef.current = 0;
    fetchJobs();
  }, [fetchJobs]);

  // Polling: start when activeCount > 0, stop when 0
  useEffect(() => {
    if (activeCount > 0 && bookId) {
      // Start polling if not already
      if (!intervalRef.current) {
        intervalRef.current = setInterval(fetchJobs, pollMs);
      }
    } else {
      // Stop polling
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeCount, bookId, fetchJobs, pollMs]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset settled flag after consumer has had a chance to react
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => setSettled(false), 100);
    return () => clearTimeout(t);
  }, [settled]);

  // Legacy compat: extract latest audiobook job
  const latestAudiobook = jobs.find((j) => j.kind === "audiobook") ?? null;
  const legacyJob = latestAudiobook ? toLegacyJob(latestAudiobook) : null;
  const legacyData: BookJobResponse = legacyJob
    ? { job: legacyJob, bookStatus: null, asset: null }
    : null;

  return {
    jobs,
    activeCount,
    summary,
    settled,
    job: legacyJob,
    data: legacyData,
    loading,
    error,
    empty: !loading && !error && jobs.length === 0,
    refetch: fetchJobs,
  };
}
