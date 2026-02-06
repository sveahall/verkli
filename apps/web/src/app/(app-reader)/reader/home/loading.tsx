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

function RailSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Skeleton height={24} width={200} className="mb-2" />
          <Skeleton height={14} width={280} />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export default function ReaderHomeLoading() {
  return (
    <div className="section-gap-lg animate-in fade-in duration-300">
      {/* Page Header Skeleton */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <Skeleton height={12} width={60} rounded="full" />
          <Skeleton height={32} width={220} />
          <Skeleton height={16} width={400} />
        </div>
        <Skeleton height={40} width={140} rounded="full" />
      </div>

      {/* Continue Reading Rail */}
      <RailSkeleton count={4} />

      {/* Published Books Rail */}
      <RailSkeleton count={6} />
    </div>
  );
}
