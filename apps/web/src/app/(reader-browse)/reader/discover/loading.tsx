import { Skeleton } from "@/components/ui/Skeleton";

function BookCardSkeleton() {
  return (
    <div className="w-[180px] flex-shrink-0 animate-pulse">
      <div className="aspect-[3/4] w-full rounded-xl bg-slate-200 dark:bg-white/10" />
      <div className="mt-3 space-y-2">
        <Skeleton height={16} className="w-3/4" />
        <Skeleton height={12} className="w-1/2" />
      </div>
    </div>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 p-8 dark:from-slate-800 dark:to-slate-900">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="aspect-[3/4] w-[180px] flex-shrink-0 rounded-xl bg-slate-300/50 dark:bg-white/10" />
        <div className="flex-1 space-y-4">
          <Skeleton height={12} width={80} rounded="full" />
          <Skeleton height={28} width={300} />
          <Skeleton height={16} className="w-full max-w-md" />
          <Skeleton height={16} className="w-3/4 max-w-sm" />
          <div className="flex gap-3 pt-2">
            <Skeleton height={40} width={120} rounded="full" />
            <Skeleton height={40} width={100} rounded="full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function RailSkeleton({ count = 5 }: { count?: number }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Skeleton height={20} width={160} className="mb-2" />
          <Skeleton height={14} width={220} />
        </div>
        <Skeleton height={32} width={80} rounded="full" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export default function DiscoverLoading() {
  return (
    <div className="section-gap-lg animate-in fade-in duration-300">
      {/* Page Header Skeleton */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <Skeleton height={12} width={70} rounded="full" />
          <Skeleton height={32} width={180} />
          <Skeleton height={16} width={320} />
        </div>
        <div className="flex gap-2">
          <Skeleton height={40} width={100} rounded="full" />
          <Skeleton height={40} width={100} rounded="full" />
        </div>
      </div>

      {/* Featured Book Skeleton */}
      <FeaturedSkeleton />

      {/* New Books Rail */}
      <RailSkeleton count={6} />

      {/* Curated Lists */}
      <RailSkeleton count={5} />
      <RailSkeleton count={5} />
    </div>
  );
}
