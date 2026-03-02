import { Skeleton, CardSkeleton } from "@/components/ui/states";

export default function ReaderProfileLoading() {
  return (
    <div className="section-gap">
      <Skeleton className="mb-2 h-7 w-28" />
      <Skeleton className="mb-6 h-4 w-48" />
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
        <CardSkeleton />
      </div>
    </div>
  );
}
