import { Skeleton } from "@/components/ui/Skeleton";

export default function ListLoading() {
  return (
    <div className="section-gap-lg animate-in fade-in duration-300">
      <div className="space-y-3">
        <Skeleton height={12} width={80} rounded="full" />
        <Skeleton height={32} width={220} />
        <Skeleton height={16} width={300} />
      </div>

      <Skeleton height={16} width={120} />

      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-slate-200 dark:bg-white/10" />
            <div className="mt-3 space-y-2">
              <Skeleton height={16} className="w-3/4" />
              <Skeleton height={12} className="w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
