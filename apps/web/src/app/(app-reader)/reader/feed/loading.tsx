import { Skeleton } from "@/components/ui/Skeleton";

export default function FeedLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-300">
      <Skeleton height={28} width={100} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-2xl border border-black/[0.06] bg-white/60 p-5 dark:border-white/[0.06] dark:bg-white/[0.02]"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />
            <div className="space-y-2">
              <Skeleton height={14} width={140} />
              <Skeleton height={10} width={80} />
            </div>
          </div>
          <Skeleton height={14} className="w-full" />
          <Skeleton height={14} className="w-2/3" />
        </div>
      ))}
    </div>
  );
}
