import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10", className)}
      {...props}
    />
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-white/10 dark:bg-white/5", className)}>
      <Skeleton className="mb-4 h-36 w-full rounded-xl" />
      <Skeleton className="mb-2 h-4 w-3/4" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableRowSkeleton({ columns = 4, className }: { columns?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 border-b border-slate-100 px-4 py-3 dark:border-white/5", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-3 flex-1" />
      ))}
    </div>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/70 bg-white px-5 py-5 dark:border-white/10 dark:bg-white/5", className)}>
      <Skeleton className="mb-3 h-8 w-20" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export type StateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, icon, className }: StateProps) {
  return (
    <div className={cn("empty-state-base space-y-4", className)}>
      <div className="flex items-start gap-4">
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            {icon}
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">{title}</h3>
          {description && <p className="text-[14px] text-slate-600 dark:text-white/60">{description}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, description, action, icon, className }: StateProps) {
  return (
    <div className={cn("rounded-2xl border border-red-200/70 bg-red-50/80 px-6 py-6 text-left dark:border-red-500/30 dark:bg-red-500/10", className)}>
      <div className="flex items-start gap-4">
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white">
            {icon}
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-[16px] font-semibold text-red-900 dark:text-red-100">{title}</h3>
          {description && <p className="text-[14px] text-red-700/80 dark:text-red-100/70">{description}</p>}
        </div>
      </div>
      {action && <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export type LoadingStateProps = {
  title?: string;
  description?: string;
  lines?: number;
  className?: string;
};

export function LoadingState({ title = "Loading", description, lines = 3, className }: LoadingStateProps) {
  return (
    <div className={cn("card-base space-y-4 px-6 py-6", className)} aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="text-[15px] font-semibold text-slate-700 dark:text-white/80">{title}</div>
        {description && <div className="text-[13px] text-slate-500 dark:text-white/50">{description}</div>}
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}
