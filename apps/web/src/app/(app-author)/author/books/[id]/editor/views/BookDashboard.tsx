"use client";

import { cn } from "@/lib/utils";

type Props = {
  bookId: string;
  bookTitle: string;
  chapters: { id: string; title: string; content: string | null; order: number }[];
  coverImageUrl: string | null;
  isPublished: boolean;
  audiobookStatus: string | null;
  trailerStatus: string | null;
  hasTranslations: boolean;
  hasPricing: boolean;
  totalWordCount: number;
  onNavigate: (panel: string) => void;
};

type StatusKind = "done" | "in-progress" | "pending";

/* ── Minimal inline SVGs ── */

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function HeadphonesIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h1v5h-1z" />
      <path d="M3 19a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H2v5h1z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function FilmIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="15" rx="2.18" ry="2.18" />
      <line x1="16" y1="3" x2="16" y2="11" />
      <line x1="8" y1="3" x2="8" y2="11" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  );
}

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4.5 16.5c-1.5-1-2.5-3-2.5-5.5 0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10c-2.5 0-4.5-1-5.5-2.5" />
      <path d="M12 4v8m4-4l-4-4-4 4" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 20v-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ── Status dot ── */

function StatusDot({ kind }: { kind: StatusKind }) {
  return (
    <div
      className={cn("h-2 w-2 rounded-full", {
        "bg-emerald-500": kind === "done",
        "bg-amber-400": kind === "in-progress",
        "bg-slate-300 dark:bg-slate-600": kind === "pending",
      })}
    />
  );
}

/* ── Setup step pill ── */

function SetupStep({
  label,
  done,
  onClick,
}: {
  label: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        done
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
          : "border border-slate-200/80 bg-white text-[#64748B] hover:border-[#907AFF]/30 hover:text-[#907AFF] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50 dark:hover:text-[#B8AAFF]"
      )}
    >
      {done && (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckIcon />
        </span>
      )}
      {label}
    </button>
  );
}

/* ── Dashboard card ── */

interface CardDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  statusKind: StatusKind;
  statusLabel: string;
  preview?: React.ReactNode;
  panel: string;
}

function DashboardCard({ card, onNavigate }: { card: CardDef; onNavigate: (p: string) => void }) {
  return (
    <button
      onClick={() => onNavigate(card.panel)}
      className="group flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 text-left transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:border-[#907AFF]/20 hover:shadow-md dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-[#907AFF]/20 dark:hover:bg-white/[0.04]"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#907AFF]/[0.09] text-[#907AFF] dark:bg-[#907AFF]/[0.14]">
          {card.icon}
        </div>
        <StatusDot kind={card.statusKind} />
      </div>

      {/* Body */}
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-[#0F172A] dark:text-white">{card.label}</h3>
        <p className="mt-0.5 text-xs text-[#64748B] dark:text-white/40">{card.description}</p>
      </div>

      {/* Cover preview */}
      {card.preview}

      {/* Footer: status + arrow */}
      <div className="flex items-center justify-between">
        <span
          className={cn("text-xs font-medium", {
            "text-emerald-600 dark:text-emerald-400": card.statusKind === "done",
            "text-amber-600 dark:text-amber-400": card.statusKind === "in-progress",
            "text-[#64748B] dark:text-white/40": card.statusKind === "pending",
          })}
        >
          {card.statusLabel}
        </span>
        <span className="text-slate-300 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0.5 dark:text-white/20">
          <ChevronRightIcon />
        </span>
      </div>
    </button>
  );
}

/* ── Main component ── */

export default function BookDashboard({
  bookTitle,
  chapters,
  coverImageUrl,
  isPublished,
  audiobookStatus,
  trailerStatus,
  hasTranslations,
  hasPricing,
  totalWordCount,
  onNavigate,
}: Props) {
  /* Status derivation */
  const audiobookDone = audiobookStatus === "completed";
  const audiobookInProgress = audiobookStatus === "in_progress";
  const trailerDone = trailerStatus === "completed";
  const trailerInProgress = trailerStatus === "in_progress";

  const getAudiobookLabel = (): [string, StatusKind] => {
    if (audiobookDone) return ["Audiobook ready", "done"];
    if (audiobookInProgress) return ["Generating...", "in-progress"];
    return ["Generate audiobook", "pending"];
  };

  const getTrailerLabel = (): [string, StatusKind] => {
    if (trailerDone) return ["Trailer ready", "done"];
    if (trailerInProgress) return ["Generating...", "in-progress"];
    return ["Create trailer", "pending"];
  };

  const [audiobookLabel, audiobookKind] = getAudiobookLabel();
  const [trailerLabel, trailerKind] = getTrailerLabel();

  /* Setup steps */
  const setupSteps = [
    { label: "Write", done: chapters.length > 0, panel: "edit" },
    { label: "Cover", done: !!coverImageUrl, panel: "cover" },
    { label: "Translate", done: hasTranslations, panel: "translate" },
    { label: "Audiobook", done: audiobookDone, panel: "audio" },
    { label: "Pricing", done: hasPricing, panel: "pricing" },
    { label: "Publish", done: isPublished, panel: "publish" },
  ];
  const completedSteps = setupSteps.filter((s) => s.done).length;
  const progressPct = Math.round((completedSteps / setupSteps.length) * 100);

  /* Cards */
  const cards: CardDef[] = [
    {
      id: "cover",
      label: "Cover",
      description: "Book cover image",
      icon: <ImageIcon />,
      statusKind: coverImageUrl ? "done" : "pending",
      statusLabel: coverImageUrl ? "Cover uploaded" : "No cover yet",
      panel: "cover",
      preview: (
        <div className="h-20 w-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-white/[0.04] dark:to-white/[0.08]">
          {coverImageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={coverImageUrl} alt="Book cover" className="h-full w-full object-cover" />
          )}
        </div>
      ),
    },
    {
      id: "translate",
      label: "Translate",
      description: "Multi-language editions",
      icon: <GlobeIcon />,
      statusKind: hasTranslations ? "done" : "pending",
      statusLabel: hasTranslations ? "Translations available" : "Original only",
      panel: "translate",
    },
    {
      id: "audio",
      label: "Audiobook",
      description: "AI-generated narration",
      icon: <HeadphonesIcon />,
      statusKind: audiobookKind,
      statusLabel: audiobookLabel,
      panel: "audio",
    },
    {
      id: "trailer",
      label: "Trailer",
      description: "Video preview clip",
      icon: <FilmIcon />,
      statusKind: trailerKind,
      statusLabel: trailerLabel,
      panel: "trailer",
    },
    {
      id: "pricing",
      label: "Pricing",
      description: "Set your price",
      icon: <TagIcon />,
      statusKind: hasPricing ? "done" : "pending",
      statusLabel: hasPricing ? "Price set" : "Free / not set",
      panel: "pricing",
    },
    {
      id: "market",
      label: "Marketing",
      description: "Campaigns & outreach",
      icon: <MegaphoneIcon />,
      statusKind: "pending",
      statusLabel: "Marketing tools",
      panel: "market",
    },
    {
      id: "publish",
      label: "Publish",
      description: "Make it discoverable",
      icon: <RocketIcon />,
      statusKind: isPublished ? "done" : "pending",
      statusLabel: isPublished ? "Published" : "Still a draft",
      panel: "publish",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FB] dark:bg-[#0F172A]/50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">

        {/* ── Book hero ── */}
        <div className="card-base relative mb-6 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[#907AFF]/[0.10] blur-[60px]" />
          </div>
          <div className="relative flex items-start gap-5 p-6">
            {/* Cover thumbnail */}
            <div className="relative h-20 w-[54px] flex-shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm dark:border-white/10 dark:from-white/[0.04] dark:to-white/[0.08]">
              {coverImageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={coverImageUrl} alt={bookTitle} className="h-full w-full object-cover" />
              )}
            </div>

            {/* Book info */}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold tracking-tight text-[#0F172A] dark:text-white">
                {bookTitle}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#64748B] dark:text-white/40">
                  {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
                </span>
                <span className="text-[#64748B]/40 dark:text-white/20">·</span>
                <span className="text-xs text-[#64748B] dark:text-white/40">
                  {totalWordCount.toLocaleString()} words
                </span>
                <span className="text-[#64748B]/40 dark:text-white/20">·</span>
                <span
                  className={cn("text-xs font-medium", {
                    "text-emerald-600 dark:text-emerald-400": isPublished,
                    "text-[#64748B] dark:text-white/40": !isPublished,
                  })}
                >
                  {isPublished ? "Published" : "Draft"}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="flex-shrink-0 text-[11px] font-medium text-[#64748B] dark:text-white/40">
                  {completedSteps}/{setupSteps.length}
                </span>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => onNavigate("edit")}
              className="hidden shrink-0 items-center gap-2 rounded-xl bg-[#907AFF] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(144,122,255,0.35)] active:scale-[0.97] sm:flex"
            >
              <PencilIcon className="h-4 w-4" />
              Continue writing
            </button>
          </div>

          {/* Mobile CTA */}
          <div className="px-6 pb-6 sm:hidden">
            <button
              onClick={() => onNavigate("edit")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#907AFF] py-2.5 text-sm font-medium text-white transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
            >
              <PencilIcon className="h-4 w-4" />
              Continue writing
            </button>
          </div>
        </div>

        {/* ── Setup checklist pills ── */}
        <div className="mb-6">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-[#64748B] dark:text-white/40">
            Setup
          </p>
          <div className="flex flex-wrap gap-2">
            {setupSteps.map((step) => (
              <SetupStep
                key={step.panel}
                label={step.label}
                done={step.done}
                onClick={() => onNavigate(step.panel)}
              />
            ))}
          </div>
        </div>

        {/* ── Cards grid ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Featured write card - spans 2 cols on large */}
          <button
            onClick={() => onNavigate("edit")}
            className="group col-span-full flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-left transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:border-[#907AFF]/20 hover:shadow-md dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-[#907AFF]/20 dark:hover:bg-white/[0.04] sm:col-span-1 lg:col-span-2"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#907AFF]/[0.09] text-[#907AFF] dark:bg-[#907AFF]/[0.14]">
              <PencilIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-[#0F172A] dark:text-white">Write</h3>
              <p className="text-xs text-[#64748B] dark:text-white/40">
                {chapters.length > 0
                  ? `${chapters.length} chapters · ${totalWordCount.toLocaleString()} words written`
                  : "Start your first chapter"}
              </p>
            </div>
            <StatusDot kind={chapters.length > 0 ? "done" : "pending"} />
            <span className="ml-1 text-slate-300 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0.5 dark:text-white/20">
              <ChevronRightIcon />
            </span>
          </button>

          {cards.map((card) => (
            <DashboardCard key={card.id} card={card} onNavigate={onNavigate} />
          ))}
        </div>

        {/* ── First chapter nudge ── */}
        {chapters.length === 0 && (
          <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-5 dark:border-amber-900/30 dark:bg-amber-900/10">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Write your first chapter to get started
            </p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/60">
              Click &ldquo;Continue writing&rdquo; or the Write card above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
