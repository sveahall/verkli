"use client";

import { useCreditsBalance } from "@/hooks/useCreditsBalance";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

type CreditsBalanceProps = {
  /** Refresh interval in ms; 0 = no polling */
  pollIntervalMs?: number;
  className?: string;
  /** Label before the number, e.g. "Credits:" */
  label?: string;
  /** Show compact (only number) or with label */
  variant?: "default" | "compact";
};

export function CreditsBalance({
  pollIntervalMs = 0,
  className,
  label = "Credits:",
  variant = "default",
}: CreditsBalanceProps) {
  const { balance, loading, error } = useCreditsBalance({ pollIntervalMs });

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Skeleton className="h-5 w-16" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "text-sm text-red-600 dark:text-red-400",
          className
        )}
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <span className={cn("font-medium tabular-nums", className)}>
        {balance}
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 text-sm text-slate-700 dark:text-white/80", className)}>
      <span>{label}</span>
      <span className="font-medium tabular-nums" aria-live="polite">
        {balance}
      </span>
    </div>
  );
}
