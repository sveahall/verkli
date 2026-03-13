import { Skeleton } from "@/components/ui/Skeleton";

export default function BillingLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-in fade-in duration-300">
      <div className="space-y-3">
        <Skeleton height={28} width={120} />
        <Skeleton height={14} width={280} />
      </div>
      <div className="rounded-2xl border border-black/[0.06] bg-white/60 p-6 dark:border-white/[0.06] dark:bg-white/[0.02] space-y-4">
        <Skeleton height={20} width={100} />
        <Skeleton height={36} width={180} />
        <Skeleton height={14} className="w-full" />
        <Skeleton height={40} width={160} rounded="full" />
      </div>
    </div>
  );
}
