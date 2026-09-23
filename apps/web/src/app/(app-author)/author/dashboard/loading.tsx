import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="space-y-3">
        <Skeleton height={28} width={200} />
        <Skeleton height={14} width={300} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-black/[0.06] bg-white/60 p-5 dark:border-border dark:bg-card space-y-3"
          >
            <Skeleton height={12} width={80} />
            <Skeleton height={28} width={60} />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 rounded-2xl border border-black/[0.06] bg-white/60 p-4 dark:border-border dark:bg-card"
          >
            <div className="h-20 w-14 flex-shrink-0 rounded-lg bg-muted dark:bg-card animate-pulse" />
            <div className="flex-1 space-y-2">
              <Skeleton height={16} width={200} />
              <Skeleton height={12} width={140} />
              <Skeleton height={12} width={100} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
