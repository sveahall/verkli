"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

const WORKFLOW_STEPS = [
  { key: "edit", label: "Write", panel: null },
  { key: "polish", label: "Polish", panel: "polish" },
  { key: "cover", label: "Cover", panel: "cover" },
  { key: "translate", label: "Translate", panel: "translate" },
  { key: "audiobook", label: "Audiobook", panel: "audiobook" },
  { key: "print", label: "Print", panel: "print" },
  { key: "pricing", label: "Pricing", panel: "pricing" },
  { key: "publish", label: "Publish", panel: "publish" },
  { key: "market", label: "Market", panel: "market" },
  { key: "statistics", label: "Stats", panel: "statistics" },
  { key: "import", label: "Import", panel: "import" },
] as const;

function stepHref(bookId: string, step: (typeof WORKFLOW_STEPS)[number]) {
  return step.panel === null
    ? `/author/books/${bookId}`
    : `/author/books/${bookId}?panel=${step.panel}`;
}

type Props = {
  bookId: string;
};

export default function WorkflowStepNav({ bookId }: Props) {
  const searchParams = useSearchParams();
  const activePanel = searchParams.get("panel")?.trim() || "edit";

  const currentIndex = WORKFLOW_STEPS.findIndex(
    (s) => s.key === activePanel
  );
  const prev = currentIndex > 0 ? WORKFLOW_STEPS[currentIndex - 1] : null;
  const next =
    currentIndex < WORKFLOW_STEPS.length - 1
      ? WORKFLOW_STEPS[currentIndex + 1]
      : null;

  return (
    <nav
      className="mx-auto mt-6 flex max-w-[820px] items-center gap-3"
      aria-label="Workflow steps"
    >
      {/* Prev */}
      {prev ? (
        <Link
          href={stepHref(bookId, prev)}
          className="group flex flex-1 items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-5 py-4 transition-all hover:border-slate-300 hover:shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/[0.14]"
        >
          <ArrowLeft className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:-translate-x-0.5 group-hover:text-slate-600 dark:text-white/30 dark:group-hover:text-white/60" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-white/30">
              Föregående
            </p>
            <p className="mt-0.5 truncate text-[15px] font-semibold text-slate-700 dark:text-white/80">
              {prev.label}
            </p>
          </div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}

      {/* Next */}
      {next ? (
        <Link
          href={stepHref(bookId, next)}
          className="group flex flex-1 items-center justify-end gap-3 rounded-xl border border-[#7c5cfc]/15 bg-[#7c5cfc] px-5 py-4 text-right transition-all hover:bg-[#6a4ce0] hover:shadow-md dark:border-[#7c5cfc]/30"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Nästa steg
            </p>
            <p className="mt-0.5 truncate text-[15px] font-semibold text-white">
              {next.label}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </nav>
  );
}
