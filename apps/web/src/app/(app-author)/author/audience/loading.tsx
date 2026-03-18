import { Skeleton } from "@/components/ui/Skeleton";

export default function AuthorAudienceLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <Skeleton height={28} width={220} />
        <Skeleton height={16} width={260} className="mt-2" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <Skeleton height={300} className="w-full" rounded="xl" />
        </div>
        <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="space-y-2">
            <Skeleton height={18} width={120} />
            <Skeleton height={44} className="w-full" rounded="lg" />
            <Skeleton height={44} className="w-full" rounded="lg" />
            <Skeleton height={44} className="w-full" rounded="lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
