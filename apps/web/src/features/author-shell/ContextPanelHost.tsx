"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import JobDetailPanel from "@/features/author-workspaces/production/JobDetailPanel";
import type { AuthorJob } from "@/features/author-workspaces/production/useAuthorJobs";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";

function ContextPanelCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ContextPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <Skeleton height={18} width={120} />
        <SkeletonText className="mt-3" lines={3} />
      </div>
      <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <Skeleton height={18} width={160} />
        <div className="mt-3 space-y-2">
          <Skeleton height={44} className="w-full" rounded="lg" />
          <Skeleton height={44} className="w-full" rounded="lg" />
          <Skeleton height={44} className="w-full" rounded="lg" />
        </div>
      </div>
    </div>
  );
}

export default function ContextPanelHost() {
  const searchParams = useSearchParams();
  const {
    state,
    activeBook,
    booksLoading,
  } = useAuthorWorkspace();
  const intent = searchParams.get("intent")?.trim() || null;
  const contextPayload = state.contextPanelState?.payload ?? null;
  const contextKind = state.contextPanelState?.kind ?? null;
  const productionJob =
    contextKind === "production-job"
      ? (((contextPayload as { job?: AuthorJob | null } | null)?.job ?? null) as AuthorJob | null)
      : null;
  const homePayload =
    contextKind === "home"
      ? ((contextPayload as {
          activeJobCount?: number;
          campaignCount?: number;
          nextSteps?: string[];
        } | null) ?? null)
      : null;
  const libraryPayload =
    contextKind === "library-book"
      ? ((contextPayload as {
          bookId?: string;
          title?: string;
          status?: string;
          updatedAt?: string | null;
        } | null) ?? null)
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
  const audiencePayload =
    contextKind === "audience"
      ? ((contextPayload as {
          subscriberCount?: number;
          campaignCount?: number;
          selectedBookTitle?: string | null;
          selectedBookDescription?: string | null;
          surface?: string | null;
        } | null) ?? null)
      : null;
  const analyticsPayload =
    contextKind === "analytics"
      ? ((contextPayload as {
          bookTitle?: string | null;
          alerts?: Array<{
            id: string;
            title: string;
            dropoffRate: number;
            highlightRate: number;
          }>;
        } | null) ?? null)
      : null;

  if (booksLoading) {
    return <ContextPanelSkeleton />;
  }

  return (
    <div className="space-y-4">
      <ContextPanelCard title="Current context">
        {activeBook ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {activeBook.title?.trim() || "Untitled"}
            </p>
            <p className="text-xs text-slate-500 dark:text-white/45">
              {activeBook.status ?? "Draft"} book selected
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-white/45">
            No book selected yet. Pick one from Library or use Cmd K.
          </p>
        )}
      </ContextPanelCard>

      {state.activeWorkspace === "home" && (
        <ContextPanelCard title="Recent activity">
          <div className="space-y-3 text-sm text-slate-600 dark:text-white/55">
            {homePayload?.nextSteps?.length ? (
              <ul className="space-y-2">
                {homePayload.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            ) : (
              <p>Resume work from your last selected book or jump into a new draft.</p>
            )}
            <div className="grid gap-2 text-xs text-slate-500 dark:text-white/45">
              <p>{homePayload?.activeJobCount ?? 0} active production jobs</p>
              <p>{homePayload?.campaignCount ?? 0} recent campaign outputs</p>
            </div>
            <Link href={activeBook ? `/author/write?bookId=${activeBook.id}` : "/author/library"} className="inline-flex text-sm font-medium text-[#907AFF]">
              {activeBook ? "Resume writing" : "Open library"}
            </Link>
          </div>
        </ContextPanelCard>
      )}

      {state.activeWorkspace === "library" && (
        <>
          <ContextPanelCard title="Library actions">
            <div className="space-y-2 text-sm">
              <Link href="/author/library?action=create-book" className="block rounded-xl border border-black/[0.06] px-3 py-2 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                Create book
              </Link>
              <Link href={activeBook ? `/author/write?bookId=${activeBook.id}` : "/author/write"} className="block rounded-xl border border-black/[0.06] px-3 py-2 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                Open writing workspace
              </Link>
            </div>
          </ContextPanelCard>
          {libraryPayload?.bookId ? (
            <ContextPanelCard title="Selected book">
              <div className="space-y-3 text-sm text-slate-600 dark:text-white/55">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {libraryPayload.title?.trim() || "Untitled"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-white/45">
                    {libraryPayload.status === "PUBLISHED" ? "Published" : "Draft"}
                    {libraryPayload.updatedAt
                      ? ` · Updated ${new Date(libraryPayload.updatedAt).toLocaleDateString("sv-SE")}`
                      : ""}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Link href={`/author/write?bookId=${libraryPayload.bookId}`} className="rounded-xl border border-black/[0.06] px-3 py-2 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                    Edit
                  </Link>
                  <Link href={`/author/production?bookId=${libraryPayload.bookId}&kind=audiobook`} className="rounded-xl border border-black/[0.06] px-3 py-2 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                    Generate audio
                  </Link>
                  <Link href={`/author/audience?bookId=${libraryPayload.bookId}&surface=beta-readers`} className="rounded-xl border border-black/[0.06] px-3 py-2 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                    Publish
                  </Link>
                  <Link href={`/author/analytics?bookId=${libraryPayload.bookId}`} className="rounded-xl border border-black/[0.06] px-3 py-2 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                    Analytics
                  </Link>
                </div>
              </div>
            </ContextPanelCard>
          ) : null}
        </>
      )}

      {state.activeWorkspace === "write" && (
        <ContextPanelCard title="AI writing tools">
          <div className="space-y-2 text-sm text-slate-600 dark:text-white/55">
            <p>Rewrite</p>
            <p>Improve pacing</p>
            <p>Generate audiobook</p>
            <p>Translate chapter</p>
            {writePayload ? (
              <div className="rounded-xl border border-black/[0.06] px-3 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-white/45">
                <p>{writePayload.bookTitle ?? activeBook?.title ?? "Untitled"}</p>
                <p>{(writePayload.activeLanguage ?? "sv").toUpperCase()} working language</p>
                <p>{(writePayload.totalBookWordCount ?? 0).toLocaleString("sv-SE")} words</p>
                {writePayload.chapterTitle ? <p>{writePayload.chapterTitle}</p> : null}
              </div>
            ) : null}
          </div>
        </ContextPanelCard>
      )}

      {state.activeWorkspace === "production" && (
        productionJob ? (
          <JobDetailPanel job={productionJob} />
        ) : (
          <ContextPanelCard title="Production jobs">
            <div className="space-y-2 text-sm text-slate-600 dark:text-white/55">
              <p>Select a job to inspect progress, preview, and logs.</p>
              {intent ? <p>Prepared intent: {intent}</p> : null}
            </div>
          </ContextPanelCard>
        )
      )}

      {state.activeWorkspace === "audience" && (
        <>
          <ContextPanelCard title="Growth tools">
            <div className="space-y-2 text-sm text-slate-600 dark:text-white/55">
              <p>Create campaign</p>
              <p>Send update to readers</p>
              <p>Export marketing assets</p>
            </div>
          </ContextPanelCard>
          {audiencePayload ? (
            <ContextPanelCard title="Audience context">
              <div className="space-y-3 text-sm text-slate-600 dark:text-white/55">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-black/[0.06] px-3 py-3 dark:border-white/10">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
                      Subscribers
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {(audiencePayload.subscriberCount ?? 0).toLocaleString("sv-SE")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-black/[0.06] px-3 py-3 dark:border-white/10">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
                      Campaigns
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {(audiencePayload.campaignCount ?? 0).toLocaleString("sv-SE")}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {audiencePayload.selectedBookTitle?.trim() || activeBook?.title?.trim() || "No book selected"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
                    {audiencePayload.selectedBookDescription?.trim() || "Use the inline surfaces to draft campaigns and reader updates."}
                  </p>
                  {audiencePayload.surface ? (
                    <p className="mt-2 text-xs text-slate-400 dark:text-white/35">
                      Surface: {audiencePayload.surface}
                    </p>
                  ) : null}
                </div>
              </div>
            </ContextPanelCard>
          ) : null}
        </>
      )}

      {state.activeWorkspace === "analytics" && (
        <>
          <ContextPanelCard title="Growth actions">
            <div className="space-y-2 text-sm text-slate-600 dark:text-white/55">
              <p>Create campaign</p>
              <p>Share analytics snapshot</p>
              <p>Export performance view</p>
            </div>
          </ContextPanelCard>
          {analyticsPayload ? (
            <ContextPanelCard title="Chapter alerts">
              <div className="space-y-3 text-sm text-slate-600 dark:text-white/55">
                <p className="font-medium text-slate-900 dark:text-white">
                  {analyticsPayload.bookTitle?.trim() || activeBook?.title?.trim() || "All books"}
                </p>
                {analyticsPayload.alerts?.length ? (
                  <div className="space-y-2">
                    {analyticsPayload.alerts.map((chapter) => (
                      <div key={chapter.id} className="rounded-xl border border-black/[0.06] px-3 py-3 dark:border-white/10">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {chapter.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-white/45">
                          {chapter.dropoffRate}% dropoff · {chapter.highlightRate}% highlight rate
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No chapter alerts yet.</p>
                )}
              </div>
            </ContextPanelCard>
          ) : null}
        </>
      )}
    </div>
  );
}
