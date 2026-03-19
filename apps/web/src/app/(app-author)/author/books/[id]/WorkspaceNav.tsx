"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/*
 * Tab groups — semantic clusters separated by thin dividers.
 *
 * Write stands alone as the primary tab because authors spend
 * most of their time there. Everything else is a secondary
 * workflow grouped by intent:
 *
 *   Write | Polish Cover | Translate Audiobook Print | Pricing Publish Market | Statistics Import
 *
 * The `primary` flag on the first group makes Write visually
 * heavier so the eye lands there first when scanning.
 */
const TAB_GROUPS: ReadonlyArray<{
  primary?: boolean;
  tabs: ReadonlyArray<{ key: string; label: string }>;
}> = [
  {
    primary: true,
    tabs: [{ key: "edit", label: "Write" }],
  },
  {
    tabs: [
      { key: "polish", label: "Polish" },
      { key: "cover", label: "Cover" },
    ],
  },
  {
    tabs: [
      { key: "translate", label: "Translate" },
      { key: "audiobook", label: "Audiobook" },
      { key: "print", label: "Print" },
    ],
  },
  {
    tabs: [
      { key: "pricing", label: "Pricing" },
      { key: "publish", label: "Publish" },
      { key: "market", label: "Market" },
    ],
  },
  {
    tabs: [
      { key: "statistics", label: "Statistics" },
      { key: "import", label: "Import" },
    ],
  },
];

type Props = {
  bookId: string;
  bookTitle: string;
};

export default function WorkspaceNav({ bookId, bookTitle }: Props) {
  const searchParams = useSearchParams();
  const activePanel = searchParams.get("panel")?.trim() || "edit";

  return (
    <nav
      className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0a0a0f]/80"
      aria-label="Book workspace"
    >
      <div className="mx-auto max-w-[1400px] px-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 pb-1.5 pt-2.5">
          <Link
            href="/author/library"
            className="inline-flex items-center gap-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Library
          </Link>

          <span
            className="text-[13px] text-slate-200 dark:text-white/15"
            aria-hidden
          >
            /
          </span>

          <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
            {bookTitle}
          </span>
        </div>

        {/* Grouped tab row */}
        <div className="-mb-px flex items-center overflow-x-auto scrollbar-none">
          {TAB_GROUPS.map((group, groupIndex) => (
            <div key={groupIndex} className="flex items-center">
              {groupIndex > 0 && (
                <div
                  className="mx-1.5 h-4 w-px shrink-0 bg-slate-200/70 dark:bg-white/[0.08]"
                  aria-hidden
                />
              )}
              <div className="flex">
                {group.tabs.map((tab) => {
                  const isActive = tab.key === activePanel;
                  const isPrimary = group.primary === true;
                  const href =
                    tab.key === "edit"
                      ? `/author/books/${bookId}`
                      : `/author/books/${bookId}?panel=${tab.key}`;

                  return (
                    <Link
                      key={tab.key}
                      href={href}
                      className={`relative shrink-0 px-3 py-2 text-[13px] transition-colors ${
                        isActive
                          ? isPrimary
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-900 dark:text-white"
                          : isPrimary
                            ? "font-semibold text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white/75"
                            : "font-medium text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {tab.label}
                      {isActive && (
                        <span className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-slate-900 dark:bg-white" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
