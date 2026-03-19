"use client";

import { WorkspaceContextCard } from "@/features/author-workspaces/WorkspaceLayout";
import type { AuthorJob } from "@/features/author-workspaces/production/useAuthorJobs";

const KIND_LABEL: Record<AuthorJob["kind"], string> = {
  audiobook: "Audiobook",
  translation: "Translation",
  marketing: "Marketing",
};

const STATUS_LABEL: Record<AuthorJob["status"], string> = {
  pending: "Preparing",
  running: "Generating",
  completed: "Ready",
  failed: "Needs attention",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AssetDetailPanel({ job }: { job: AuthorJob | null }) {
  if (!job) {
    return (
      <WorkspaceContextCard
        eyebrow="Asset context"
        title="No asset selected"
        description="Choose an asset to inspect its state."
      />
    );
  }

  return (
    <WorkspaceContextCard
      eyebrow="Asset context"
      title={job.bookTitle}
      description={`${KIND_LABEL[job.kind]}${job.language ? ` · ${job.language.toUpperCase()}` : ""}`}
    >
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
            Status
          </p>
          <p className="mt-2 text-sm text-slate-900 dark:text-white">
            {STATUS_LABEL[job.status]}
          </p>
        </div>

        <div className="border-t border-slate-200/80 pt-4 dark:border-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
            Timeline
          </p>
          <dl className="mt-3 space-y-3 text-sm text-slate-600 dark:text-white/55">
            <div className="flex items-center justify-between gap-3">
              <dt>Created</dt>
              <dd className="text-right text-slate-900 dark:text-white">
                {formatDateTime(job.createdAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Finished</dt>
              <dd className="text-right text-slate-900 dark:text-white">
                {formatDateTime(job.finishedAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-slate-200/80 pt-4 dark:border-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
            Latest update
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-white/55">
            {job.error ?? job.logSummary}
          </p>
        </div>
      </div>
    </WorkspaceContextCard>
  );
}
