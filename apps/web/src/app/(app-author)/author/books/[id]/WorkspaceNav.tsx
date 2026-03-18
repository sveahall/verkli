"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "write", label: "Write" },
  { key: "marketing", label: "Marketing" },
  { key: "analytics", label: "Analytics" },
  { key: "settings", label: "Settings" },
] as const;

type Props = {
  bookId: string;
};

export default function WorkspaceNav({ bookId }: Props) {
  const pathname = usePathname();

  const activeTab = TABS.find((tab) =>
    pathname?.endsWith(`/${tab.key}`) || pathname?.includes(`/${tab.key}/`)
  ) ?? TABS[0];

  return (
    <nav
      className="border-b border-black/[0.06] bg-white/95 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#0a0a0f]/95"
      aria-label="Book workspace status"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-white/45">
          <Link
            href="/author/books"
            className="transition hover:text-slate-900 dark:hover:text-white/80"
          >
            Books
          </Link>
          <span aria-hidden>/</span>
          <span className="font-medium text-slate-900 dark:text-white">
            {activeTab.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-black/[0.06] bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/45">
            Workspace
          </span>
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab.key;
            const href = `/author/books/${bookId}/${tab.key}`;

            return (
              <Link
                key={tab.key}
                href={href}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  isActive
                    ? "bg-[#907AFF]/12 text-[#5c4bb8] dark:bg-[#907AFF]/18 dark:text-[#c5b9ff]"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-white/50 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
