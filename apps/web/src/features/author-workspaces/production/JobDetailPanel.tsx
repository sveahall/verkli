"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { AuthorJob } from "@/features/author-workspaces/production/useAuthorJobs";

const ProductionAudioPreview = dynamic(
  () => import("@/features/author-workspaces/production/ProductionAudioPreview"),
  {
    ssr: false,
    loading: () => <div className="h-[120px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />,
  }
);

const STATUS_COPY: Record<AuthorJob["status"], string> = {
  pending: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

function buildBookPanelHref(
  bookId: string,
  panel: "audiobook" | "translate" | "publish" | "print" | "market",
  language?: string | null
) {
  const params = new URLSearchParams({ panel });
  if (language?.trim()) params.set("lang", language.trim());
  return `/author/books/${bookId}?${params.toString()}`;
}

function getMetaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export default function JobDetailPanel({ job }: { job: AuthorJob | null }) {
  if (!job) {
    return (
      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Job detail</p>
          <p className="text-sm text-slate-500 dark:text-white/45">
            Select a job to inspect progress, preview, and logs.
          </p>
        </CardContent>
      </Card>
    );
  }

  const meta = (job.meta ?? {}) as Record<string, unknown>;
  const audioUrl =
    job.kind === "audiobook"
      ? getMetaString(meta, "generatedChapterAudioUrl") ??
        getMetaString(meta, "audioUrl") ??
        getMetaString(meta, "assetAudioUrl") ??
        job.previewUrl
      : null;
  const manifestUrl =
    job.kind === "audiobook"
      ? getMetaString(meta, "manifestUrl") ?? getMetaString(meta, "assetManifestUrl")
      : null;
  const hasAudiobookPreview = Boolean(audioUrl || manifestUrl);
  const reviewHref =
    job.kind === "audiobook"
      ? buildBookPanelHref(job.bookId, "audiobook", job.language)
      : job.kind === "translation"
        ? buildBookPanelHref(job.bookId, "translate", job.language)
        : buildBookPanelHref(job.bookId, "market", job.language);
  const publishHref =
    job.kind === "marketing"
      ? `/author/audience?bookId=${job.bookId}&surface=campaigns`
      : buildBookPanelHref(job.bookId, "publish", job.language);
  const printHref = buildBookPanelHref(job.bookId, "print", job.language);
  const reviewLabel =
    job.kind === "audiobook"
      ? "Review audiobook"
      : job.kind === "translation"
        ? "Review translation"
        : "Open marketing assets";
  const publishLabel = job.kind === "marketing" ? "Open audience" : "Open publish controls";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
                {job.kind}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {job.bookTitle}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
                {job.logSummary}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                job.status === "completed"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : job.status === "failed"
                    ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : job.status === "running"
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              }`}
            >
              {STATUS_COPY[job.status]}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-white/45">
              <span>Progress</span>
              <span>{job.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-[#907AFF]" style={{ width: `${Math.max(4, job.progress)}%` }} />
            </div>
          </div>

          <dl className="grid gap-3 text-sm text-slate-600 dark:text-white/65">
            <div className="flex items-center justify-between gap-3">
              <dt>Status</dt>
              <dd>{STATUS_COPY[job.status]}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Book</dt>
              <dd>{job.bookTitle}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Language</dt>
              <dd>{job.language ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Created</dt>
              <dd>{job.createdAt ? new Date(job.createdAt).toLocaleString("sv-SE") : "—"}</dd>
            </div>
          </dl>

          {job.status === "completed" ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={reviewHref}
                className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
              >
                {reviewLabel}
              </Link>
              <Link
                href={publishHref}
                className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/75 dark:hover:bg-white/5"
              >
                {publishLabel}
              </Link>
              {job.kind !== "marketing" ? (
                <Link
                  href={printHref}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/75 dark:hover:bg-white/5"
                >
                  Print on demand
                </Link>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {job.kind === "audiobook" && hasAudiobookPreview ? (
        <ProductionAudioPreview
          bookId={job.bookId}
          audioUrl={audioUrl}
          manifestUrl={manifestUrl}
        />
      ) : null}

      {job.kind === "audiobook" && job.status === "completed" && !hasAudiobookPreview ? (
        <Card>
          <CardContent className="text-sm text-slate-600 dark:text-white/70">
            Audiobook completed, but this job has no playable preview attached yet. Open the audiobook workflow to regenerate or inspect the asset source.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Log summary</p>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
            {job.error ?? job.logSummary}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
