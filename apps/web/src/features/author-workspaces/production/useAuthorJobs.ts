"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isJobActiveStatus, type JobStatus } from "@/lib/job-status";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

export type AuthorJobKind = "audiobook" | "translation" | "marketing";

export type AuthorJob = {
  id: string;
  kind: AuthorJobKind;
  status: JobStatus;
  bookId: string;
  bookTitle: string;
  language: string | null;
  progress: number;
  previewUrl: string | null;
  logSummary: string;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  meta: Record<string, unknown>;
};

type AuthorJobsResponse = {
  jobs: AuthorJob[];
};

export function useAuthorJobs() {
  const isVisible = useDocumentVisible();
  const [jobs, setJobs] = useState<AuthorJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/author/jobs", { credentials: "include" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not load jobs.");
        setJobs([]);
        return;
      }

      const body = (await response.json()) as AuthorJobsResponse;
      setJobs(body.jobs ?? []);
      setError(null);
    } catch {
      setError("Could not load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const activeCount = useMemo(
    () => jobs.filter((job) => isJobActiveStatus(job.status)).length,
    [jobs]
  );

  useEffect(() => {
    if (!isVisible || activeCount === 0) return;
    const interval = window.setInterval(() => {
      void fetchJobs();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeCount, fetchJobs, isVisible]);

  return {
    jobs,
    loading,
    error,
    activeCount,
    refetch: fetchJobs,
  };
}
