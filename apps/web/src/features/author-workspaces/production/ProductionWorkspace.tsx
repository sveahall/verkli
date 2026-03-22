"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import {
  getAudiobookEnabled,
  getMarketingEnabled,
  getTranslationsEnabled,
} from "@/lib/flags";
import {
  useAuthorJobs,
  type AuthorJob,
  type AuthorJobKind,
} from "@/features/author-workspaces/production/useAuthorJobs";

const ProductionAudioPreview = dynamic(
  () => import("@/features/author-workspaces/production/ProductionAudioPreview"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[120px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
    ),
  }
);

type ProductionWorkspaceProps = {
  books: Array<{ id: string; title: string }>;
};

type ProductionSection = "assets" | "audiobooks" | "translations" | "exports";

function buildBookPanelHref(
  bookId: string,
  panel: "audiobook" | "translate" | "publish" | "print" | "market",
  language?: string | null
) {
  const params = new URLSearchParams({ panel });
  if (language?.trim()) params.set("lang", language.trim());
  return `/author/books/${bookId}?${params.toString()}`;
}

function AudiobookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 10V7a5 5 0 0 1 10 0v3" strokeLinecap="round" />
      <rect x="1" y="10" width="3" height="4" rx="1" />
      <rect x="12" y="10" width="3" height="4" rx="1" />
    </svg>
  );
}

function TranslationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M1.5 8h13" />
      <path d="M8 1.5c-2 2.5-3 4.5-3 6.5s1 4 3 6.5c2-2.5 3-4.5 3-6.5s-1-4-3-6.5" />
    </svg>
  );
}

function MarketingIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M14 2.5L5.5 6H3a1.5 1.5 0 0 0-1.5 1.5v1A1.5 1.5 0 0 0 3 10h2.5L14 13.5V2.5Z" />
      <path d="M5.5 10v3l2-1" strokeLinecap="round" />
    </svg>
  );
}

function KindIcon({
  kind,
  className,
}: {
  kind: AuthorJobKind;
  className?: string;
}) {
  if (kind === "audiobook") return <AudiobookIcon className={className} />;
  if (kind === "translation") return <TranslationIcon className={className} />;
  return <MarketingIcon className={className} />;
}

const KIND_LABEL: Record<AuthorJobKind, string> = {
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

const STATUS_SORT_ORDER: Record<string, number> = {
  failed: 0,
  running: 1,
  pending: 2,
  completed: 3,
};

const PRODUCTION_SECTION_META: Record<
  ProductionSection,
  {
    title: string;
    description: string;
    primaryLabel: string;
    primaryKind: AuthorJobKind;
  }
> = {
  assets: {
    title: "Assets",
    description: "Review every generated asset and open the next production workflow.",
    primaryLabel: "Generate audiobook",
    primaryKind: "audiobook",
  },
  audiobooks: {
    title: "Audiobooks",
    description: "Generate and review audiobook assets in one place.",
    primaryLabel: "Generate audiobook",
    primaryKind: "audiobook",
  },
  translations: {
    title: "Translations",
    description: "Track translated versions and continue translation work from the book workspace.",
    primaryLabel: "Create translation",
    primaryKind: "translation",
  },
  exports: {
    title: "Exports",
    description: "Review generated export-ready marketing assets for the current catalog.",
    primaryLabel: "Create export",
    primaryKind: "marketing",
  },
};

function getMetaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("sv-SE", {
    month: "short",
    day: "numeric",
  });
}

function getRowMeta(job: AuthorJob): string {
  const status = STATUS_LABEL[job.status];
  if (job.status === "running") return `${status} · ${job.progress}%`;
  if (job.status === "failed") return status;
  return `${status} · ${formatShortDate(job.finishedAt ?? job.createdAt)}`;
}

function AssetRow({
  job,
  isSelected,
  onSelect,
}: {
  job: AuthorJob;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-full px-3 py-3 text-left transition",
        isSelected
          ? "bg-[#F2EDFF] dark:bg-[#7C6CFF]/15"
          : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
      )}
    >
      <KindIcon kind={job.kind} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-white/35" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
          {KIND_LABEL[job.kind]}
          {job.language ? ` · ${job.language.toUpperCase()}` : ""}
        </p>
        <p className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-white">
          {job.bookTitle}
        </p>
        <p className="mt-1 text-[12px] text-slate-500 dark:text-white/45">
          {getRowMeta(job)}
        </p>
      </div>
    </button>
  );
}

function ActionLink({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-[40px] items-center rounded-full px-4 text-[14px] font-medium transition",
        primary
          ? "bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] text-white"
          : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-white/60 dark:hover:border-white/20 dark:hover:text-white"
      )}
    >
      {label}
    </Link>
  );
}

function buildAssetActions(job: AuthorJob) {
  const workflowHref =
    job.kind === "audiobook"
      ? buildBookPanelHref(job.bookId, "audiobook", job.language)
      : job.kind === "translation"
        ? buildBookPanelHref(job.bookId, "translate", job.language)
        : buildBookPanelHref(job.bookId, "market", job.language);

  if (job.kind === "marketing") {
    return [
      { href: workflowHref, label: "Open workflow", primary: true },
      { href: `/author/audience?bookId=${job.bookId}&surface=campaigns`, label: "Launch campaign" },
    ];
  }

  return [
    { href: workflowHref, label: "Open workflow", primary: true },
    { href: `/author/books/${job.bookId}`, label: "Open book" },
  ];
}

function AssetWorkspaceView({ job }: { job: AuthorJob }) {
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
  const shareUrl =
    job.kind === "marketing"
      ? getMetaString(meta, "shareUrl") ?? job.previewUrl
      : null;
  const actionLinks = buildAssetActions(job);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow">Preview</p>
            <h2 className="mt-2 text-section-title">
              {job.bookTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
              {KIND_LABEL[job.kind]} · {STATUS_LABEL[job.status]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actionLinks.map((action) => (
              <ActionLink
                key={action.label}
                href={action.href}
                label={action.label}
                primary={action.primary}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-white p-6 dark:bg-white/[0.04]">
          {job.kind === "audiobook" ? (
            (audioUrl || manifestUrl) ? (
              <ProductionAudioPreview
                bookId={job.bookId}
                audioUrl={audioUrl}
                manifestUrl={manifestUrl}
              />
            ) : (
              <p className="text-sm text-slate-500 dark:text-white/45">
                No playable audio is attached yet.
              </p>
            )
          ) : null}

          {job.kind === "translation" ? (
            <p className="text-sm text-slate-500 dark:text-white/45">
              Review and edit the translated manuscript in the book workflow.
            </p>
          ) : null}

          {job.kind === "marketing" ? (
            shareUrl ? (
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-slate-900 hover:text-slate-600 dark:text-white dark:hover:text-white/75"
              >
                Open generated preview
              </a>
            ) : (
              <p className="text-sm text-slate-500 dark:text-white/45">
                No preview URL is attached yet.
              </p>
            )
          ) : null}
        </div>
      </section>

      <section>
        <p className="text-eyebrow">Details</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
              Type
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {KIND_LABEL[job.kind]}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
              Language
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {job.language?.toUpperCase() || "Default"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
              Created
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {formatShortDate(job.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
              Finished
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {formatShortDate(job.finishedAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <p className="text-eyebrow">Activity</p>
        {job.status === "running" || job.status === "pending" ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-white/45">{job.logSummary}</span>
              <span className="text-slate-900 dark:text-white">{job.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-[#907AFF] dark:bg-[#907AFF]"
                style={{ width: `${Math.max(4, job.progress)}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-4 text-sm text-slate-600 dark:text-white/55">
          {job.error ?? job.logSummary}
        </div>
      </section>
    </div>
  );
}

function ProductionEmptyState({
  section,
  hasBooks,
  primaryLabel,
  showPrimaryAction,
  onCreate,
}: {
  section: ProductionSection;
  hasBooks: boolean;
  primaryLabel: string;
  showPrimaryAction: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center dark:bg-white/[0.04] sm:p-10">
      <p className="text-eyebrow">Production</p>
      <h2 className="mt-4 text-[30px] font-semibold tracking-tight text-slate-900 dark:text-white">
        No {section === "assets" ? "assets" : section} yet
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
        {hasBooks
          ? "Choose one production lane from the sidebar and generate the first asset for it."
          : "Create a book first, then come back when the manuscript is ready for production."}
      </p>
      {hasBooks && showPrimaryAction ? (
        <div className="mt-8 flex justify-center">
          <Button
            size="sm"
            className="rounded-full bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] text-white"
            onClick={onCreate}
          >
            {primaryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function ProductionWorkspace({ books }: ProductionWorkspaceProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setCurrentBookId, setSelectedJobId } = useAuthorWorkspace();
  const { jobs, loading, error, refetch } = useAuthorJobs();

  const bookIdFilter = searchParams.get("bookId");
  const kindFilter = searchParams.get("kind") as AuthorJobKind | null;
  const requestedJobId = searchParams.get("jobId");

  const audioEnabled = getAudiobookEnabled();
  const translationsEnabled = getTranslationsEnabled();
  const marketingEnabled = getMarketingEnabled();
  const section: ProductionSection =
    kindFilter === "audiobook"
      ? "audiobooks"
      : kindFilter === "translation"
        ? "translations"
        : kindFilter === "marketing"
          ? "exports"
          : "assets";
  const sectionMeta = PRODUCTION_SECTION_META[section];
  const primaryKind: AuthorJobKind =
    section === "assets"
      ? audioEnabled
        ? "audiobook"
        : translationsEnabled
          ? "translation"
          : "marketing"
      : sectionMeta.primaryKind;
  const primaryLabel =
    primaryKind === "audiobook"
      ? "Generate audiobook"
      : primaryKind === "translation"
        ? "Create translation"
        : "Create export";
  const canCreatePrimary =
    (primaryKind === "audiobook" && audioEnabled) ||
    (primaryKind === "translation" && translationsEnabled) ||
    (primaryKind === "marketing" && marketingEnabled);

  const sortedJobs = useMemo(() => {
    const filtered = jobs.filter((job) => {
      if (bookIdFilter && job.bookId !== bookIdFilter) return false;
      if (kindFilter && job.kind !== kindFilter) return false;
      return true;
    });

    filtered.sort(
      (a, b) =>
        (STATUS_SORT_ORDER[a.status] ?? 4) - (STATUS_SORT_ORDER[b.status] ?? 4)
    );

    return filtered;
  }, [bookIdFilter, jobs, kindFilter]);

  const selectedJobId = sortedJobs.some((job) => job.id === requestedJobId)
    ? requestedJobId
    : sortedJobs[0]?.id ?? null;
  const selectedJob = sortedJobs.find((job) => job.id === selectedJobId) ?? null;

  useEffect(() => {
    setCurrentBookId(bookIdFilter ?? selectedJob?.bookId ?? null);
    setSelectedJobId(selectedJob?.id ?? null);
  }, [bookIdFilter, selectedJob, setCurrentBookId, setSelectedJobId]);

  const updateQuery = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    const query = params.toString();
    router.replace(query ? `/author/production?${query}` : "/author/production", {
      scroll: false,
    });
  };

  const navigateToCreate = (kind: AuthorJobKind) => {
    const bookId = bookIdFilter ?? books[0]?.id;
    if (!bookId) return;
    if (kind === "audiobook") {
      router.push(buildBookPanelHref(bookId, "audiobook"));
    } else if (kind === "translation") {
      router.push(buildBookPanelHref(bookId, "translate"));
    } else {
      router.push(buildBookPanelHref(bookId, "market"));
    }
  };

  return (
    <WorkspaceLayout
      header={
        <header>
          <h1 className="text-[17px] font-medium uppercase tracking-[0.14em] text-[#8B92A5] dark:text-white/50">
            Production
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={bookIdFilter ?? ""}
            onChange={(event) => updateQuery({ bookId: event.target.value || null })}
            className="h-10 min-w-[160px] rounded-full border-0 bg-white px-4 text-[14px] text-[#5C6375] outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#907AFF]/30 dark:bg-white/[0.06] dark:text-white/60 dark:ring-white/10"
            aria-label="Filter books"
          >
            <option value="">All books</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
          {canCreatePrimary ? (
            <Button
              className="rounded-full bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] text-white"
              onClick={() => navigateToCreate(primaryKind)}
            >
              {primaryLabel}
            </Button>
          ) : null}
        </div>
        {loading ? (
          <div className="space-y-6">
            <div className="h-[180px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
            <div className="h-[120px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
            <div className="h-[320px] animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-white p-6 dark:bg-white/[0.04] sm:p-7">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-4 rounded-full"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        ) : sortedJobs.length === 0 ? (
          <ProductionEmptyState
            section={section}
            hasBooks={books.length > 0}
            primaryLabel={primaryLabel}
            showPrimaryAction={canCreatePrimary}
            onCreate={() => navigateToCreate(primaryKind)}
          />
        ) : (
          <div className="space-y-8">
            <section>
              <p className="text-eyebrow">{sectionMeta.title}</p>
              <div className="mt-4 space-y-1">
                {sortedJobs.map((job) => (
                  <AssetRow
                    key={job.id}
                    job={job}
                    isSelected={selectedJobId === job.id}
                    onSelect={() => updateQuery({ jobId: job.id })}
                  />
                ))}
              </div>
            </section>

            <section className="min-w-0">
              {selectedJob ? (
                <AssetWorkspaceView job={selectedJob} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-white/45">
                  Select an asset from the list.
                </p>
              )}
            </section>
          </div>
        )}
        </>
      }
    />
  );
}
