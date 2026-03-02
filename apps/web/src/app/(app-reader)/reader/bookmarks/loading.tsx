import { Skeleton, TableRowSkeleton } from "@/components/ui/states";

export default function BookmarksLoading() {
  return (
    <div className="section-gap">
      <Skeleton className="mb-6 h-7 w-36" />
      <div className="rounded-2xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-white/5">
        {Array.from({ length: 6 }).map((_, i) => (
          <TableRowSkeleton key={i} columns={3} />
        ))}
      </div>
    </div>
  );
}
