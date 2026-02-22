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

function HeroSkeleton() {
  return (
    <section className="card-base-subtle grid gap-7 p-6 md:p-8 lg:grid-cols-[1.2fr_0.9fr]">
      <div className="space-y-4">
        <Skeleton height={24} width={110} rounded="full" />
        <Skeleton height={44} width={320} />
        <Skeleton height={16} width={460} />
        <div className="flex flex-wrap gap-2">
          <Skeleton height={30} width={140} rounded="full" />
          <Skeleton height={30} width={110} rounded="full" />
          <Skeleton height={30} width={120} rounded="full" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton height={42} width={150} rounded="full" />
          <Skeleton height={42} width={130} rounded="full" />
        </div>
      </div>
      <div className="min-h-[260px] rounded-2xl border border-slate-200/80 bg-slate-200/60 dark:border-white/10 dark:bg-white/10" />
    </section>
  );
}

function MetricsSkeleton() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="card-base-subtle px-4 py-4 space-y-2">
          <Skeleton height={12} width={120} />
          <Skeleton height={30} width={64} />
          <Skeleton height={12} width={160} />
        </div>
      ))}
    </section>
  );
}

export default function ReaderHomeLoading() {
  return (
    <div className="section-gap-lg animate-in fade-in duration-300">
      <HeroSkeleton />
      <MetricsSkeleton />

      <RailSkeleton count={4} />
      <RailSkeleton count={5} />
      <RailSkeleton count={6} />
      <RailSkeleton count={6} />
    </div>
  );
}
