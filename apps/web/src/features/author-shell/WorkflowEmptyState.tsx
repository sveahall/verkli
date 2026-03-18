"use client";

import Link from "next/link";

export default function WorkflowEmptyState({
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="max-w-lg rounded-3xl border border-dashed border-black/[0.08] bg-white/70 p-10 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/45">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={primaryHref}
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
          >
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex rounded-xl border border-black/[0.08] px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
