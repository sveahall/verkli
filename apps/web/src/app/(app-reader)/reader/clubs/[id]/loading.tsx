import { Skeleton } from "@/components/ui/Skeleton";

export default function ClubDetailLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Skeleton height={64} width={64} rounded="full" />
        <div className="space-y-2">
          <Skeleton height={24} width={200} />
          <Skeleton height={14} width={120} />
        </div>
      </div>
      <div className="card-base-subtle p-6 space-y-3">
        <Skeleton height={16} className="w-full" />
        <Skeleton height={16} className="w-4/5" />
        <Skeleton height={16} className="w-2/3" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-base-subtle p-4 space-y-2">
            <Skeleton height={14} width={160} />
            <Skeleton height={12} className="w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
