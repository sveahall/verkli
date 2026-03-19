"use client";

import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import {
  WorkspaceContextCard,
  WorkspaceMetric,
} from "@/features/author-workspaces/WorkspaceLayout";
import AssetDetailPanel from "@/features/author-workspaces/production/AssetDetailPanel";
import type { AuthorJob } from "@/features/author-workspaces/production/useAuthorJobs";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("sv-SE", {
    month: "short",
    day: "numeric",
  });
}

function ContextPanelSkeleton() {
  return (
    <div className="space-y-4">
      <WorkspaceContextCard>
        <Skeleton height={18} width={120} />
        <SkeletonText className="mt-3" lines={3} />
      </WorkspaceContextCard>
      <WorkspaceContextCard>
        <Skeleton height={18} width={140} />
        <SkeletonText className="mt-3" lines={2} />
      </WorkspaceContextCard>
    </div>
  );
}

export default function ContextPanelHost() {
  const { state, activeBook, booksLoading } = useAuthorWorkspace();
  const contextPayload = state.contextPanelState?.payload ?? null;
  const contextKind = state.contextPanelState?.kind ?? null;

  const productionJob =
    contextKind === "production-asset"
      ? (((contextPayload as { job?: AuthorJob | null } | null)?.job ?? null) as AuthorJob | null)
      : null;

  const writePayload =
    contextKind === "write"
      ? ((contextPayload as {
          bookTitle?: string;
          activeLanguage?: string;
          chapterTitle?: string | null;
          totalBookWordCount?: number;
        } | null) ?? null)
      : null;

  if (booksLoading) {
    return <ContextPanelSkeleton />;
  }

  return (
    <div className="space-y-4">
      <WorkspaceContextCard
        eyebrow="Current context"
        title={activeBook?.title?.trim() || "No active book"}
        description={
          activeBook
            ? `${activeBook.status ?? "Draft"} workspace in focus`
            : "Select a book to bring its context into the workspace."
        }
      >
        {activeBook?.updatedAt ? (
          <p className="text-[12px] text-slate-500 dark:text-white/45">
            Updated {formatDate(activeBook.updatedAt)}
          </p>
        ) : null}
      </WorkspaceContextCard>

      {state.activeWorkspace === "production" ? (
        productionJob ? (
          <AssetDetailPanel job={productionJob} />
        ) : (
          <WorkspaceContextCard
            eyebrow="Asset context"
            title="No asset selected"
            description="Choose an asset from the list to inspect its current state."
          />
        )
      ) : null}

      {contextKind === "write" && writePayload ? (
        <WorkspaceContextCard
          eyebrow="Writing context"
          title={writePayload.bookTitle ?? activeBook?.title ?? "Untitled"}
          description={
            writePayload.chapterTitle
              ? `Editing ${writePayload.chapterTitle}`
              : "Open a chapter to start writing."
          }
        >
          <dl className="space-y-3">
            <WorkspaceMetric
              label="Language"
              value={(writePayload.activeLanguage ?? "sv").toUpperCase()}
            />
            <WorkspaceMetric
              label="Words"
              value={(writePayload.totalBookWordCount ?? 0).toLocaleString("sv-SE")}
            />
          </dl>
        </WorkspaceContextCard>
      ) : null}
    </div>
  );
}
