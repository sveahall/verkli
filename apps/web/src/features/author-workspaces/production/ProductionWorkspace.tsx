"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import EmptyState, { DocumentIcon } from "@/components/reader/EmptyState";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import {
  useAuthorJobs,
  type AuthorJob,
  type AuthorJobKind,
} from "@/features/author-workspaces/production/useAuthorJobs";

const STATUS_ORDER = ["pending", "running", "completed", "failed"] as const;

type ProductionWorkspaceProps = {
  books: Array<{ id: string; title: string }>;
};

function JobColumn({
  title,
  description,
  jobs,
  selectedJobId,
  onSelect,
}: {
  title: string;
  description: string;
  jobs: AuthorJob[];
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
}) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
          <p className="text-xs text-slate-500 dark:text-white/45">{description}</p>
        </div>
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
            No jobs in this state.
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => onSelect(job.id)}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  selectedJobId === job.id
                    ? "border-[#907AFF]/40 bg-[#907AFF]/5"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {job.bookTitle}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-white/45">
                      {job.logSummary}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-white/35">
                    {job.progress}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProductionWorkspace({
  books,
}: ProductionWorkspaceProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    setCurrentBookId,
    setSelectedJobId,
    setContextPanelState,
    clearContextPanelState,
  } = useAuthorWorkspace();
  const { jobs, loading, error, refetch } = useAuthorJobs();

  const bookIdFilter = searchParams.get("bookId");
  const kindFilter = searchParams.get("kind") as AuthorJobKind | null;
  const requestedJobId = searchParams.get("jobId");

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (bookIdFilter && job.bookId !== bookIdFilter) return false;
      if (kindFilter && job.kind !== kindFilter) return false;
      return true;
    });
  }, [bookIdFilter, jobs, kindFilter]);

  const selectedJobId = filteredJobs.some((job) => job.id === requestedJobId)
    ? requestedJobId
    : filteredJobs[0]?.id ?? null;

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) ?? null;

  useEffect(() => {
    setCurrentBookId(bookIdFilter ?? selectedJob?.bookId ?? null);
    setSelectedJobId(selectedJob?.id ?? null);
    setContextPanelState(
      selectedJob
        ? {
            kind: "production-job",
            payload: {
              job: selectedJob,
            },
          }
        : null
    );
    return clearContextPanelState;
  }, [
    bookIdFilter,
    clearContextPanelState,
    selectedJob,
    setContextPanelState,
    setCurrentBookId,
    setSelectedJobId,
  ]);

  const jobsByStatus = useMemo(() => {
    const grouped = new Map<string, AuthorJob[]>();
    for (const status of STATUS_ORDER) grouped.set(status, []);
    for (const job of filteredJobs) {
      grouped.get(job.status)?.push(job);
    }
    return grouped;
  }, [filteredJobs]);

  const updateQuery = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    const query = params.toString();
    router.replace(query ? `/author/production?${query}` : "/author/production", { scroll: false });
  };

  return (
    <WorkspaceLayout
      header={
        <PageHeader
          eyebrow="Produce"
          title="Production workspace"
          description="Track audiobook generation, translation jobs, and marketing asset output across every book."
          actions={
            <>
              <select
                value={bookIdFilter ?? ""}
                onChange={(event) => updateQuery({ bookId: event.target.value || null })}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                <option value="">All books</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
              <select
                value={kindFilter ?? ""}
                onChange={(event) => updateQuery({ kind: event.target.value || null })}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                <option value="">All job types</option>
                <option value="audiobook">Audiobook</option>
                <option value="translation">Translation</option>
                <option value="marketing">Marketing</option>
              </select>
              <Button variant="secondary" onClick={() => void refetch()}>
                Refresh
              </Button>
            </>
          }
        />
      }
      main={
        loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[220px] animate-pulse rounded-3xl bg-slate-100 dark:bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="text-sm text-red-600 dark:text-red-400">{error}</CardContent>
          </Card>
        ) : filteredJobs.length === 0 ? (
          <EmptyState
            title="No production jobs yet"
            description="Generate an audiobook, start a translation, or create marketing assets to populate the queue."
            icon={<DocumentIcon className="h-10 w-10" />}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <JobColumn
              title="Queued jobs"
              description="Ready to start"
              jobs={jobsByStatus.get("pending") ?? []}
              selectedJobId={selectedJobId}
              onSelect={(jobId) => updateQuery({ jobId })}
            />
            <JobColumn
              title="Running jobs"
              description="Currently processing"
              jobs={jobsByStatus.get("running") ?? []}
              selectedJobId={selectedJobId}
              onSelect={(jobId) => updateQuery({ jobId })}
            />
            <JobColumn
              title="Completed jobs"
              description="Ready for review"
              jobs={jobsByStatus.get("completed") ?? []}
              selectedJobId={selectedJobId}
              onSelect={(jobId) => {
                updateQuery({ jobId });
              }}
            />
            <JobColumn
              title="Failed jobs"
              description="Needs attention"
              jobs={jobsByStatus.get("failed") ?? []}
              selectedJobId={selectedJobId}
              onSelect={(jobId) => {
                updateQuery({ jobId });
              }}
            />
          </div>
        )
      }
    />
  );
}
