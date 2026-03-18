import { Skeleton } from "@/components/ui/Skeleton";

export default function AuthorProductionLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <Skeleton height={28} width={220} />
        <Skeleton height={16} width={240} className="mt-2" />
      </div>
      <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <Skeleton height={60} className="w-full" rounded="xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} height={36} className="w-full" rounded="lg" />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <Skeleton height={280} className="w-full" rounded="xl" />
        </div>
      </div>
    </div>
  );
}
