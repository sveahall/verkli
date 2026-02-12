import { StatCardSkeleton, TableRowSkeleton } from "@/components/ui/states";

export default function StatsLoading() {
  return (
    <div className="section-gap">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-white/5">
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
