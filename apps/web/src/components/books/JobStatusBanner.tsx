"use client";

import type { UnifiedJob } from "@/hooks/useBookJobs";
import { isJobActiveStatus, normalizeJobStatus, type JobStatus } from "@/lib/job-status";

/**
 * Job status for display.
 * Canonical status: pending | running | completed | failed.
 */
export type JobDisplayStatus = JobStatus;

export type JobStatusData = {
  id: string;
  status: JobStatus;
  totalChapters?: number;
  completedChapters?: number;
  currentChapterTitle?: string | null;
  error?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
} | null;

function normalizeStatus(apiStatus: string): JobDisplayStatus {
  return normalizeJobStatus(apiStatus);
}

export type JobStatusBannerProps = {
  /** Job data from API (e.g. audiobook/status). null = no job. */
  job: JobStatusData;
  /** Optional label, e.g. "Audiobook" */
  label?: string;
  /** Hide banner when no job and not loading (empty state is handled by parent if needed) */
  hideWhenEmpty?: boolean;
  /** Called when user clicks retry on a failed job */
  onRetry?: () => void;
  className?: string;
};

const STATUS_STYLES: Record<
  JobDisplayStatus,
  { bg: string; text: string; label: string }
> = {
  pending: {
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    text: "text-amber-800 dark:text-amber-200",
    label: "Pending",
  },
  running: {
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-200",
    label: "Running",
  },
  completed: {
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-200",
    label: "Completed",
  },
  failed: {
    bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
    text: "text-red-800 dark:text-red-200",
    label: "Failed",
  },
};

export default function JobStatusBanner({
  job,
  label = "Job",
  hideWhenEmpty = false,
  onRetry,
  className,
}: JobStatusBannerProps) {
  if (!job) {
    if (hideWhenEmpty) return null;
    return (
      <div
        role="status"
        aria-label="No ongoing activity"
        className={
          className ??
          "rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/5"
        }
      >
        <p className="text-sm text-slate-600 dark:text-white/60">
          No ongoing or recently completed activity for {label}.
        </p>
      </div>
    );
  }

  const displayStatus = normalizeStatus(job.status);
  const style = STATUS_STYLES[displayStatus];
  const total = job.totalChapters ?? 0;
  const completed = job.completedChapters ?? 0;
  const hasProgress = total > 0;
  const progressPercent = hasProgress ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border px-4 py-3 ${style.bg} ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-sm font-semibold ${style.text}`}>
          {label}: {style.label}
        </span>
        {hasProgress && displayStatus === "running" && (
          <span className={`text-sm ${style.text}`}>
            {completed} / {total} chapters
            {job.currentChapterTitle ? ` — ${job.currentChapterTitle}` : ""}
          </span>
        )}
      </div>
      {hasProgress && (displayStatus === "running" || displayStatus === "pending") && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-current opacity-70 transition-[width] duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      {displayStatus === "failed" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-red-700 dark:text-red-300" role="alert">
            {job.error || "Something went wrong."}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Kind labels ──────────────────────────────────────────────────────────── */

const KIND_LABELS: Record<string, string> = {
  audiobook: "Audiobook",
  translation: "Translation",
  import: "Import",
};

/* ─── Multi-job banner wrapper ─────────────────────────────────────────────── */

/** Convert a UnifiedJob to the legacy JobStatusData shape for JobStatusBanner */
function toJobStatusData(j: UnifiedJob): NonNullable<JobStatusData> {
  const meta = j.meta as Record<string, unknown>;
  return {
    id: j.id,
    status: j.status,
    totalChapters: (meta.totalChapters as number) ?? (j.progress > 0 ? 100 : undefined),
    completedChapters: (meta.completedChapters as number) ?? (j.progress > 0 ? j.progress : undefined),
    currentChapterTitle: (meta.currentChapterTitle as string) ?? undefined,
    error: j.error ?? undefined,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}

/**
 * Filters jobs to show: active (pending/running), recent failed (<5min),
 * or recent completed (<5min). Returns [] if nothing to show.
 * Active jobs older than 30 min are treated as stale/failed.
 */
function getVisibleJobs(jobs: UnifiedJob[]): UnifiedJob[] {
  const now = Date.now();
  const RECENT_MS = 5 * 60 * 1000;
  const STALE_MS = 30 * 60 * 1000;
  const seen = new Set<string>();
  return jobs
    .filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      const status = normalizeJobStatus(j.status);
      if (status === "pending" || status === "running") return true;
      if (status === "failed" || status === "completed") {
        const finished = j.finishedAt ? new Date(j.finishedAt).getTime() : 0;
        return now - finished < RECENT_MS;
      }
      return false;
    })
    .map((j) => {
      if (isJobActiveStatus(j.status)) {
        const created = j.createdAt ? new Date(j.createdAt).getTime() : 0;
        if (created > 0 && now - created > STALE_MS) {
          return { ...j, status: "failed", error: "The task appears stuck. Try again." };
        }
      }
      return j;
    });
}

export type BookJobsBannerProps = {
  jobs: UnifiedJob[];
  /** Called when user clicks retry on a failed job */
  onRetry?: (job: UnifiedJob) => void;
  className?: string;
};

export function BookJobsBanner({ jobs, onRetry, className }: BookJobsBannerProps) {
  const visible = getVisibleJobs(jobs);
  if (visible.length === 0) return null;

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {visible.map((j) => (
        <JobStatusBanner
          key={j.id}
          job={toJobStatusData(j)}
          label={KIND_LABELS[j.kind] ?? j.kind}
          hideWhenEmpty
          onRetry={normalizeJobStatus(j.status) === "failed" && onRetry ? () => onRetry(j) : undefined}
        />
      ))}
    </div>
  );
}
