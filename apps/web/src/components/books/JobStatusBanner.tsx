"use client";

import type { UnifiedJob } from "@/hooks/useBookJobs";

/**
 * Job status for display. API may return queued|pending|processing|completed|failed.
 * We normalize to: queued | running | done | failed
 */
export type JobDisplayStatus = "queued" | "running" | "done" | "failed";

export type JobStatusData = {
  id: string;
  status: string;
  totalChapters?: number;
  completedChapters?: number;
  currentChapterTitle?: string | null;
  error?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
} | null;

function normalizeStatus(apiStatus: string): JobDisplayStatus {
  const s = apiStatus?.toLowerCase() ?? "";
  if (s === "completed") return "done";
  if (s === "failed") return "failed";
  if (s === "queued" || s === "pending") return "queued";
  if (s === "processing") return "running";
  return "running";
}

export type JobStatusBannerProps = {
  /** Job data from API (e.g. audiobook/status). null = no job. */
  job: JobStatusData;
  /** Optional label, e.g. "Audiobook" */
  label?: string;
  /** Hide banner when no job and not loading (empty state is handled by parent if needed) */
  hideWhenEmpty?: boolean;
  className?: string;
};

const STATUS_STYLES: Record<
  JobDisplayStatus,
  { bg: string; text: string; label: string }
> = {
  queued: {
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    text: "text-amber-800 dark:text-amber-200",
    label: "Köad",
  },
  running: {
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-200",
    label: "Pågår",
  },
  done: {
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-200",
    label: "Klar",
  },
  failed: {
    bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
    text: "text-red-800 dark:text-red-200",
    label: "Misslyckades",
  },
};

export default function JobStatusBanner({
  job,
  label = "Jobb",
  hideWhenEmpty = false,
  className,
}: JobStatusBannerProps) {
  if (!job) {
    if (hideWhenEmpty) return null;
    return (
      <div
        role="status"
        aria-label="Inga jobb"
        className={
          className ??
          "rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/5"
        }
      >
        <p className="text-sm text-slate-600 dark:text-white/60">
          Inga pågående eller senaste jobb för {label.toLowerCase()}.
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
            {completed} / {total} kapitel
            {job.currentChapterTitle ? ` — ${job.currentChapterTitle}` : ""}
          </span>
        )}
      </div>
      {hasProgress && (displayStatus === "running" || displayStatus === "queued") && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-current opacity-70 transition-[width] duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      {displayStatus === "failed" && job.error && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
          {job.error}
        </p>
      )}
    </div>
  );
}

/* ─── Kind labels ──────────────────────────────────────────────────────────── */

const KIND_LABELS: Record<string, string> = {
  audiobook: "Ljudbok",
  translation: "Översättning",
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
 * Filters jobs to show: active (pending/processing), recent failed (<5min),
 * or recent completed (<5min). Returns [] if nothing to show.
 */
function getVisibleJobs(jobs: UnifiedJob[]): UnifiedJob[] {
  const now = Date.now();
  const RECENT_MS = 5 * 60 * 1000;
  const seen = new Set<string>();
  return jobs.filter((j) => {
    if (seen.has(j.id)) return false;
    seen.add(j.id);
    if (j.status === "pending" || j.status === "processing") return true;
    if (j.status === "failed" || j.status === "completed") {
      const finished = j.finishedAt ? new Date(j.finishedAt).getTime() : 0;
      return now - finished < RECENT_MS;
    }
    return false;
  });
}

export type BookJobsBannerProps = {
  jobs: UnifiedJob[];
  className?: string;
};

export function BookJobsBanner({ jobs, className }: BookJobsBannerProps) {
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
        />
      ))}
    </div>
  );
}
