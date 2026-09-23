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
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:text-muted-foreground">
            {title}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 overflow-x-auto">{children}</div>
        {footer}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/[0.04] bg-card p-5 dark:border-border dark:bg-card">
      {(title || subtitle) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="author-section-title text-[13px] font-medium text-foreground dark:text-foreground">
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
