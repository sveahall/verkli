"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import CreateBookEntry from "@/app/(app-author)/author/books/CreateBookEntry";
import EmptyState, { BookIcon } from "@/components/reader/EmptyState";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import { useAuthorJobs } from "@/features/author-workspaces/production/useAuthorJobs";
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
    bookTitle: string;
    channel: string;
    status: string;
    headline: string | null;
    updatedAt: string | null;
  }>;
  readerActivity: {
    views: number;
    reads: number;
    bookmarks: number;
    subscribers: number;
  };
};

export default function HomeWorkspace({
  drafts,
  campaigns,
  readerActivity,
}: HomeWorkspaceProps) {
  const { jobs } = useAuthorJobs();
  const { setContextPanelState, clearContextPanelState } = useAuthorWorkspace();
  const activeJobs = jobs.filter((job) => job.status === "pending" || job.status === "running").slice(0, 4);

  useEffect(() => {
    setContextPanelState({
      kind: "home",
      payload: {
        activeJobCount: activeJobs.length,
        campaignCount: campaigns.length,
        nextSteps: [
          "Resume your most recent draft.",
          "Check running production jobs.",
          "Review campaign output before publishing.",
          "Open analytics if engagement dips.",
        ],
      },
    });
    return clearContextPanelState;
  }, [activeJobs.length, campaigns.length, clearContextPanelState, setContextPanelState]);

  return (
    <WorkspaceLayout
      header={
        <PageHeader
          eyebrow="Home"
          title="Daily cockpit"
          description="Resume drafts, track active production, and keep growth work moving."
          actions={<CreateBookEntry />}
        />
      }
      main={
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Drafts to resume</p>
                <p className="text-xs text-slate-500 dark:text-white/45">
                  Pick up where you left off.
                </p>
              </div>
              {drafts.length === 0 ? (
                <EmptyState
                  title="No drafts yet"
                  description="Create your first book to start the workflow."
                  icon={<BookIcon className="h-8 w-8" />}
                  variant="subtle"
                />
              ) : (
                <div className="space-y-2">
                  {drafts.slice(0, 4).map((draft) => (
                    <Link
                      key={draft.id}
                      href={`/author/write?bookId=${draft.id}`}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {draft.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-white/45">
                          {draft.updatedAt ? `Updated ${new Date(draft.updatedAt).toLocaleDateString("sv-SE")}` : "Recently created"}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-white/35">Resume</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Active production jobs</p>
                <p className="text-xs text-slate-500 dark:text-white/45">
                  Cross-book output that needs monitoring.
                </p>
              </div>
              {activeJobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
                  No active jobs right now.
                </div>
              ) : (
                <div className="space-y-2">
                  {activeJobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/author/production?jobId=${job.id}&bookId=${job.bookId}`}
                      className="block rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{job.bookTitle}</p>
                          <p className="text-xs text-slate-500 dark:text-white/45">{job.logSummary}</p>
                        </div>
                        <span className="text-xs text-slate-400 dark:text-white/35">{job.progress}%</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Campaign results</p>
                <p className="text-xs text-slate-500 dark:text-white/45">
                  Latest generated or published marketing assets.
                </p>
              </div>
              {campaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
                  No campaign output yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {campaigns.slice(0, 4).map((campaign) => (
                    <Link
                      key={campaign.id}
                      href="/author/audience?surface=campaigns"
                      className="block rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                    >
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {campaign.bookTitle} • {campaign.channel}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
                        {campaign.headline ?? "Generated asset"} • {campaign.status}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { label: "Views", value: readerActivity.views },
                { label: "Reads", value: readerActivity.reads },
                { label: "Bookmarks", value: readerActivity.bookmarks },
                { label: "Subscribers", value: readerActivity.subscribers },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/5"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                    {metric.value.toLocaleString("sv-SE")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      }
    />
  );
}
