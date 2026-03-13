import { Skeleton } from "@/components/ui/Skeleton";

export default function AuthorsLoading() {
  return (
    <div className="section-gap-lg animate-in fade-in duration-300">
      <div className="space-y-3">
        <Skeleton height={12} width={70} rounded="full" />
        <Skeleton height={32} width={140} />
        <Skeleton height={16} width={360} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-black/[0.06] bg-white/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]"
          >
            <div className="h-12 w-12 flex-shrink-0 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />
            <div className="flex-1 space-y-2">
              <Skeleton height={16} width={120} />
              <Skeleton height={12} width={80} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
