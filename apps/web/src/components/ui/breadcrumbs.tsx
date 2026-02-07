import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("text-[13px]", className)}>
      <ol className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-white/50">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-md transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b12]"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn(isLast ? "text-slate-700 dark:text-white/80" : undefined)}>
                  {item.label}
                </span>
              )}
              {!isLast && (
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 4l6 6-6 6" />
                </svg>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
