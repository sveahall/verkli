import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
 * Skeleton Component
 * ───────────────────────────────────────────────────────────────────────────── */

interface SkeletonProps {
  className?: string;
  /** Custom width (defaults to 100%) */
  width?: string | number;
  /** Custom height (defaults to 1rem) */
  height?: string | number;
  /** Rounded style variant */
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
}

const roundedStyles = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

export function Skeleton({
  className = "",
  width,
  height,
  rounded = "md",
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-white/10 ${roundedStyles[rounded]} ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Skeleton Presets
 * ───────────────────────────────────────────────────────────────────────────── */

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          className={i === lines - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5 ${className}`}
    >
      <Skeleton height={120} className="mb-4" rounded="lg" />
      <Skeleton height={20} className="mb-2 w-3/4" />
      <Skeleton height={14} className="w-1/2" />
    </div>
  );
}

export function SkeletonBookItem({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <Skeleton height={18} className="mb-1.5 w-2/3" />
        <Skeleton height={12} className="w-1/3" />
      </div>
      <Skeleton width={70} height={24} rounded="full" />
    </div>
  );
}

export function SkeletonBooksList({
  count = 5,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBookItem key={i} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Loading Wrapper
 * ───────────────────────────────────────────────────────────────────────────── */

interface LoadingWrapperProps {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}

export function LoadingWrapper({
  loading,
  skeleton,
  children,
}: LoadingWrapperProps) {
  if (loading) return <>{skeleton}</>;
  return <>{children}</>;
}
