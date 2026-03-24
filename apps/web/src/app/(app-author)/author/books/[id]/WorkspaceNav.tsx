"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/*
 * Tabs grouped by workflow phase, separated by visual dividers.
 *
 *   Write · Polish · Cover  |  Translate · Audiobook · Print  |  Pricing · Publish · Market  |  Statistics · Import
 */
const TAB_GROUPS: ReadonlyArray<ReadonlyArray<{ key: string; label: string }>> = [
  [
    { key: "edit", label: "Write" },
    { key: "polish", label: "Polish" },
    { key: "cover", label: "Cover" },
  ],
  [
    { key: "translate", label: "Translate" },
    { key: "audiobook", label: "Audiobook" },
    { key: "print", label: "Print" },
  ],
  [
    { key: "pricing", label: "Pricing" },
    { key: "publish", label: "Publish" },
    { key: "market", label: "Market" },
  ],
  [
    { key: "statistics", label: "Stats" },
    { key: "import", label: "Import" },
  ],
];

type Props = {
  bookId: string;
  bookTitle: string;
};

export default function WorkspaceNav({ bookId, bookTitle }: Props) {
  const searchParams = useSearchParams();
  const activePanel = searchParams.get("panel")?.trim() || "edit";
  const contentWidthClass =
    activePanel === "edit" ? "max-w-[1100px]" : "max-w-[1400px]";

  return (
    <nav
      className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0a0a0f]/90"
      aria-label="Book workspace"
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className={`mx-auto w-full ${contentWidthClass}`}>
        {/* Breadcrumb */}
        <div className="flex min-h-[68px] items-center gap-3 border-b border-slate-100/90 py-3 dark:border-white/[0.05]">
          <Link
            href="/author/library"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-white/45 dark:hover:bg-white/[0.06] dark:hover:text-white/75"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Library
          </Link>

          <span
            className="text-[13px] text-slate-300 dark:text-white/20"
            aria-hidden
          >
            /
          </span>

          <span className="truncate text-[17px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">
            {bookTitle}
          </span>
        </div>

        {/* Tab row */}
        <div className="relative -mb-px">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white to-transparent dark:from-[#0a0a0f]" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent dark:from-[#0a0a0f]" />
          <div className="flex min-h-[58px] items-center gap-1 overflow-x-auto scrollbar-none">
            {TAB_GROUPS.map((group, gi) => (
              <div key={gi} className="flex items-center">
              {gi > 0 && (
                <div
                  className="mx-2 h-6 w-px shrink-0 bg-slate-200 dark:bg-white/[0.08] sm:mx-3"
                  aria-hidden
                />
              )}
              {group.map((tab) => {
                const isActive = tab.key === activePanel;
                const href =
                  tab.key === "edit"
                    ? `/author/books/${bookId}`
                    : `/author/books/${bookId}?panel=${tab.key}`;

                return (
                  <Link
                    key={tab.key}
                    href={href}
                    className={`relative shrink-0 rounded-lg px-4 py-2.5 text-[14px] font-semibold tracking-[-0.01em] transition-all ${
                      isActive
                        ? "bg-[#907AFF]/12 text-[#5132de] dark:bg-[#907AFF]/18 dark:text-[#cfbfff]"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-white/50 dark:hover:bg-white/[0.06] dark:hover:text-white/85"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {tab.label}
                    {isActive && (
                      <span className="absolute inset-x-3 -bottom-[1px] h-[2.5px] rounded-full bg-[#907AFF]" />
                    )}
                  </Link>
                );
              })}
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </nav>
  );
}
