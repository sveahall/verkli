"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TOOL_META,
  TOOL_ORDER,
  getToolHref,
} from "./editor/bookEditor.shared";

type Props = {
  bookId: string;
};

export default function WorkflowStepNav({ bookId }: Props) {
  const searchParams = useSearchParams();
  const activePanel = searchParams.get("panel")?.trim() || "edit";

  const currentIndex = Math.max(
    0,
    TOOL_ORDER.findIndex((step) => step === activePanel)
  );
  const currentTool = TOOL_ORDER[currentIndex] ?? "edit";
  const prev = currentIndex > 0 ? TOOL_ORDER[currentIndex - 1] : null;
  const next =
    currentIndex < TOOL_ORDER.length - 1
      ? TOOL_ORDER[currentIndex + 1]
      : null;
  const progress = TOOL_ORDER.length > 0 ? ((currentIndex + 1) / TOOL_ORDER.length) * 100 : 0;

  return (
    <nav
      className="mx-auto max-w-[1520px]"
      aria-label="Workflow steps"
    >
      <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0f1117]/90 dark:shadow-none">
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px] lg:items-center">
          {prev ? (
            <Link
              href={getToolHref(bookId, prev)}
              className="group flex w-full items-center gap-3 justify-start rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 transition-[transform,border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-slate-300 hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)] active:scale-[0.995] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.05] dark:hover:shadow-none"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-x-0.5 group-hover:text-slate-700 dark:text-white/30 dark:group-hover:text-white/70" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/30">
                  Previous
                </p>
                <p className="mt-1 truncate text-[15px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
                  {TOOL_META[prev].label}
                </p>
              </div>
            </Link>
          ) : (
            <div className="hidden lg:block" />
          )}

          <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-center dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-white/30">
              Flow
            </p>
            <p className="mt-1 text-[14px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
              Step {currentIndex + 1} of {TOOL_ORDER.length}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r from-[#f3b873] via-[#8e79ff] to-[#8ad7c7]",
                  currentTool === "publish" || currentTool === "market" ? "opacity-100" : "opacity-90"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {next ? (
            <Link
              href={getToolHref(bookId, next)}
              className="group flex w-full items-center justify-end gap-3 rounded-2xl bg-[#7c5cfc] px-4 py-4 text-right shadow-[0_16px_36px_rgba(124,92,252,0.28)] transition-[transform,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[#6e52eb] hover:shadow-[0_18px_40px_rgba(124,92,252,0.34)] active:scale-[0.995]"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                  Next
                </p>
                <p className="mt-1 truncate text-[15px] font-semibold tracking-[-0.02em] text-white">
                  {TOOL_META[next].label}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-white/75 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0.5 group-hover:text-white" />
            </Link>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      </div>
    </nav>
  );
}
