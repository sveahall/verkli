"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import CreateBookEntry from "@/app/(app-author)/author/books/CreateBookEntry";
import { useAuthorJobs } from "@/features/author-workspaces/production/useAuthorJobs";
import {
  WorkspaceSurface,
} from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";

type HomeWorkspaceProps = {
  drafts: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string | null;
  }>;
  campaigns: Array<{
    id: string;
    bookId: string;
    bookTitle: string;
    channel: string;
    status: string;
    headline: string | null;
    updatedAt: string | null;
  }>;
  subscriberCount: number;
  readersToday: number;
};

type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  href: string;
};

const JOB_KIND_LABELS: Record<string, string> = {
  audiobook: "Audiobook ready",
  translation: "Translation complete",
  marketing: "Campaign updated",
};

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("sv-SE");
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Recently created";
  return `Updated ${new Date(value).toLocaleDateString("sv-SE")}`;
}

export default function HomeWorkspace({
  drafts,
  campaigns,
  subscriberCount,
  readersToday,
}: HomeWorkspaceProps) {
  const { jobs } = useAuthorJobs();
  const { setCurrentBookId } = useAuthorWorkspace();

  const activeJobs = jobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  );
  const completedJobs = jobs.filter(
    (job) => job.status === "completed" || job.status === "failed"
  );
  const primaryDraft = drafts[0] ?? null;

  const activityFeed = useMemo<ActivityItem[]>(() => {
    if (!primaryDraft) return [];

    const items: ActivityItem[] = [];

    for (const job of completedJobs.slice(0, 6)) {
      if (job.bookId !== primaryDraft.id) continue;
      if (!job.finishedAt) continue;
      items.push({
        id: `job-${job.id}`,
        label:
          job.status === "failed"
            ? `${job.kind.charAt(0).toUpperCase() + job.kind.slice(1)} failed`
            : (JOB_KIND_LABELS[job.kind] ?? "Job completed"),
        detail: job.bookTitle,
        timestamp: job.finishedAt,
        href: `/author/production?jobId=${job.id}&bookId=${job.bookId}`,
      });
    }

    for (const campaign of campaigns.slice(0, 4)) {
      if (campaign.bookId !== primaryDraft.id) continue;
      if (!campaign.updatedAt) continue;
      items.push({
        id: `campaign-${campaign.id}`,
        label: campaign.headline?.trim() || `Campaign ${campaign.status.toLowerCase()}`,
        detail: `${campaign.bookTitle} · ${campaign.channel}`,
        timestamp: campaign.updatedAt,
        href: "/author/audience?surface=campaigns",
      });
    }

    items.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return items.slice(0, 8);
  }, [campaigns, completedJobs, primaryDraft]);

  useEffect(() => {
    setCurrentBookId(primaryDraft?.id ?? null);
  }, [primaryDraft?.id, setCurrentBookId]);

  return (
    <WorkspaceLayout
      header={
        <PageHeader
          eyebrow="Home"
          title="Workspace"
          description="Continue the current book, check today’s movement, and review what changed."
          actions={<CreateBookEntry />}
        />
      }
      main={
        <div className="space-y-10">
          <section>
            <WorkspaceSurface className="p-6 sm:p-8">
              <p className="text-eyebrow">Continue writing</p>
              {primaryDraft ? (
                <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-[32px] font-semibold tracking-tight text-slate-900 dark:text-white">
                      {primaryDraft.title}
                    </h2>
                    <p className="mt-2 text-[15px] text-slate-500 dark:text-white/45">
                      {formatUpdatedAt(primaryDraft.updatedAt)}
                    </p>
                  </div>
                  <Link href={`/author/books/${primaryDraft.id}`}>
                    <Button size="lg">Resume writing</Button>
                  </Link>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">
                      Start your first book
                    </h2>
                    <p className="mt-2 text-[15px] text-slate-500 dark:text-white/45">
                      Create a book to open the writing workspace.
                    </p>
                  </div>
                  <CreateBookEntry />
                </div>
              )}
            </WorkspaceSurface>
          </section>

          <section className="border-y border-slate-200/80 py-4 dark:border-white/10">
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
                  Readers today
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-white">
                  {readersToday.toLocaleString("sv-SE")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
                  Subscribers
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-white">
                  {subscriberCount.toLocaleString("sv-SE")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
                  Active production jobs
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-white">
                  {activeJobs.length}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-eyebrow">Recent activity</p>
                <h2 className="mt-2 text-section-title">Latest changes</h2>
              </div>
            </div>
            {activityFeed.length > 0 ? (
              <div className="mt-5 divide-y divide-slate-200/80 dark:divide-white/10">
                {activityFeed.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-start justify-between gap-4 py-4 transition first:pt-0 hover:text-slate-600 dark:hover:text-white/80"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
                        {item.detail}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400 dark:text-white/35">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-slate-500 dark:text-white/45">
                Activity will appear here when this book changes.
              </p>
            )}
          </section>
        </div>
      }
    />
  );
}
