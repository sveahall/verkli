import { Skeleton } from "@/components/ui/Skeleton";

export default function PublishLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <Skeleton height={28} width={200} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-base-subtle p-4 space-y-3">
            <div className="aspect-[3/4] rounded-xl bg-slate-200/60 dark:bg-white/10" />
            <Skeleton height={16} width={160} />
            <Skeleton height={12} width={100} />
          </div>
        ))}
      </div>
    </div>
  );
}
