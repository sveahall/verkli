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
      <div className="mb-0 border-b border-black/[0.06] pb-4 dark:border-white/[0.08]">
        {title ? (
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
            {title}
          </p>
        ) : null}
        {children}
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
