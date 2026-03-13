import { Skeleton } from "@/components/ui/Skeleton";

export default function AuthorProfileLoading() {
  return (
    <div className="section-gap-lg animate-in fade-in duration-300">
      <div className="space-y-3">
        <Skeleton height={12} width={60} rounded="full" />
        <Skeleton height={32} width={200} />
        <Skeleton height={16} width={320} />
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-4 dark:border-white/10 dark:bg-white/5">
        <Skeleton width={64} height={64} rounded="full" />
        <div className="space-y-2">
          <Skeleton height={18} width={140} />
          <Skeleton height={14} width={100} />
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton height={20} width={160} />
        <div className="flex flex-wrap gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-[180px] flex-shrink-0">
              <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-slate-200 dark:bg-white/10" />
              <div className="mt-3 space-y-2">
                <Skeleton height={16} className="w-3/4" />
                <Skeleton height={12} className="w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
