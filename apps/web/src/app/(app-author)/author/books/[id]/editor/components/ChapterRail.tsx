"use client";

import type { ReactNode } from "react";

type Props = {
  variant: "compact" | "sidebar";
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export default function ChapterRail({
  variant,
  title,
  subtitle,
  footer,
  children,
}: Props) {
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3 backdrop-blur-xl shadow-[0_12px_40px_rgba(15,23,42,0.06)] dark:border-white/[0.08] dark:bg-[#0f1117]/35 dark:shadow-none">
        {title ? (
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/30">
            {title}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 overflow-x-auto">{children}</div>
        {footer}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
      {(title || subtitle) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">
            {title}
          </h2>
          {subtitle}
        </div>
      )}
      {children}
      {footer}
    </div>
  );
}
