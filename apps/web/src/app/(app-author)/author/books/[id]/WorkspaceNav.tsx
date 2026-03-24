"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Props = {
  bookId: string;
  bookTitle: string;
};

export default function WorkspaceNav({ bookTitle }: Props) {
  return (
    <nav
      className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0a0a0f]/90"
      aria-label="Book workspace"
    >
      <div className="mx-auto flex h-12 max-w-screen-xl items-center gap-2.5 px-5">
        <Link
          href="/author/library"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/[0.04] dark:hover:text-white/70"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Library
        </Link>

        <span
          className="text-[11px] text-slate-200 dark:text-white/15"
          aria-hidden
        >
          /
        </span>

        <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">
          {bookTitle}
        </span>
      </div>
    </nav>
  );
}
