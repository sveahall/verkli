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
      <div className="flex items-center gap-3 px-1 py-3">
        {title ? (
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-white/30">
            {title}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 overflow-x-auto">{children}</div>
        {footer}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/[0.04] bg-white p-5 dark:border-white/[0.06] dark:bg-[#111318]">
      {(title || subtitle) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold text-slate-700 dark:text-white/85">
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
