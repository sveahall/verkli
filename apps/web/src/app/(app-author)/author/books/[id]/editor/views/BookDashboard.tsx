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

type StatusIndicator = "done" | "in-progress" | "pending";

interface DashboardCard {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: string;
  statusType: StatusIndicator;
  onClick: () => void;
  preview?: React.ReactNode;
}

function StatusDot({ type }: { type: StatusIndicator }) {
  const colorMap = {
    done: "bg-emerald-500",
    "in-progress": "bg-amber-500",
    pending: "bg-slate-300 dark:bg-slate-600",
  };
  return <div className={cn("h-2 w-2 rounded-full", colorMap[type])} />;
}

function PencilIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function HeadphonesIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h1v5h-1z" />
      <path d="M3 19a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H2v5h1z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="2" y="7" width="20" height="15" rx="2.18" ry="2.18" />
      <line x1="16" y1="3" x2="16" y2="11" />
      <line x1="8" y1="3" x2="8" y2="11" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 13c1.5-2 4-3.5 7-3.5 5 0 10 4 10 9s-5 9-10 9c-3 0-5.5-1.5-7-3.5" />
      <line x1="4" y1="13" x2="4" y2="21" />
      <line x1="6" y1="13" x2="6" y2="21" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4.5 16.5c-1.5-1-2.5-3-2.5-5.5 0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10c-2.5 0-4.5-1-5.5-2.5" />
      <path d="M12 4v8m4-4l-4-4-4 4" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 20v-6" />
    </svg>
  );
}

export default function BookDashboard({
  bookId: _bookId, // eslint-disable-line @typescript-eslint/no-unused-vars
  bookTitle,
  chapters,
  coverImageUrl,
  isPublished,
  audiobookStatus,
  trailerStatus,
  hasTranslations,
  totalWordCount,
  onNavigate,
}: Props) {
  // Determine status indicators
  const getAudiobookStatus = (): [string, StatusIndicator] => {
    if (!audiobookStatus) return ["Generate audiobook", "pending"];
    if (audiobookStatus === "completed") return ["Audiobook ready", "done"];
    if (audiobookStatus === "in_progress") return ["Generating...", "in-progress"];
    return ["Audiobook generation failed", "pending"];
  };

  const getTrailerStatus = (): [string, StatusIndicator] => {
    if (!trailerStatus) return ["Create trailer", "pending"];
    if (trailerStatus === "completed") return ["Trailer ready", "done"];
    if (trailerStatus === "in_progress") return ["Generating...", "in-progress"];
    return ["Trailer generation failed", "pending"];
  };

  const [audiobookLabel, audiobookType] = getAudiobookStatus();
  const [trailerLabel, trailerType] = getTrailerStatus();

  const cards: DashboardCard[] = [
    {
      id: "write",
      label: "Write",
      icon: <PencilIcon />,
      status: `${chapters.length} chapters · ${totalWordCount.toLocaleString()} words`,
      statusType: chapters.length > 0 ? "done" : "pending",
      onClick: () => onNavigate("edit"),
    },
    {
      id: "cover",
      label: "Cover",
      icon: <ImageIcon />,
      status: coverImageUrl ? "Cover uploaded" : "No cover yet",
      statusType: coverImageUrl ? "done" : "pending",
      onClick: () => onNavigate("cover"),
      preview: coverImageUrl ? (
        <div className="h-24 w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-white/5">
          <img
            src={coverImageUrl}
            alt="Book cover"
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="h-24 w-full rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-white/5 dark:to-white/10" />
      ),
    },
    {
      id: "audio",
      label: "Audio",
      icon: <HeadphonesIcon />,
      status: audiobookLabel,
      statusType: audiobookType,
      onClick: () => onNavigate("audio"),
    },
    {
      id: "translate",
      label: "Translate",
      icon: <GlobeIcon />,
      status: hasTranslations ? "Translations available" : "Original only",
      statusType: hasTranslations ? "done" : "pending",
      onClick: () => onNavigate("translate"),
    },
    {
      id: "trailer",
      label: "Trailer",
      icon: <FilmIcon />,
      status: trailerLabel,
      statusType: trailerType,
      onClick: () => onNavigate("trailer"),
    },
    {
      id: "market",
      label: "Market",
      icon: <MegaphoneIcon />,
      status: "Marketing tools",
      statusType: "pending",
      onClick: () => onNavigate("market"),
    },
    {
      id: "publish",
      label: "Publish",
      icon: <RocketIcon />,
      status: isPublished ? "Published" : "Draft",
      statusType: isPublished ? "done" : "pending",
      onClick: () => onNavigate("publish"),
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              {bookTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
              Book dashboard
            </p>
          </div>
          <button
            onClick={() => onNavigate("edit")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#907AFF] px-6 py-2.5 font-medium text-white transition-all duration-200 hover:bg-[#7d68e6] hover:shadow-lg hover:shadow-[#907AFF]/20 active:scale-95 dark:hover:shadow-[#907AFF]/10"
          >
            <PencilIcon />
            Continue writing
          </button>
        </div>

        {/* Dashboard Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={card.onClick}
              className={cn(
                "group flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all duration-200 dark:border-white/10 dark:bg-white/[0.02]",
                "hover:border-slate-300 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-1 dark:hover:border-white/20 dark:hover:bg-white/[0.04] dark:hover:shadow-black/20",
                "active:scale-95"
              )}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#907AFF]/10 text-[#907AFF] dark:bg-[#907AFF]/20">
                  {card.icon}
                </div>
                <StatusDot type={card.statusType} />
              </div>

              {/* Card Content */}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {card.label}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
                  {card.status}
                </p>
              </div>

              {/* Preview if available */}
              {card.preview && <div className="mt-2">{card.preview}</div>}

              {/* Arrow indicator */}
              <div className="text-slate-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-slate-400 dark:text-white/20 dark:group-hover:text-white/30">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Empty State Help */}
        {chapters.length === 0 && (
          <div className="mt-12 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/30 dark:bg-amber-900/10">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Get started by writing your first chapter
            </p>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300/80">
              Click the &ldquo;Continue writing&rdquo; button or the &ldquo;Write&rdquo; card to begin adding
              content to your book.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
