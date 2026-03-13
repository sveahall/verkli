import { Skeleton } from "@/components/ui/Skeleton";

export default function WriterLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 animate-in fade-in duration-300">
      <div className="flex items-center gap-5">
        <div className="h-20 w-20 flex-shrink-0 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />
        <div className="space-y-3">
          <Skeleton height={24} width={180} />
          <Skeleton height={14} width={120} />
        </div>
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton height={14} className="w-full" />
        <Skeleton height={14} className="w-3/4" />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[3/4] w-full rounded-xl bg-slate-200 dark:bg-white/10" />
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
