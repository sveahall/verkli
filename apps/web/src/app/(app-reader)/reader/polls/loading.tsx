import { Skeleton } from "@/components/ui/Skeleton";

export default function PollsLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <Skeleton height={28} width={120} />
        <Skeleton height={36} width={120} rounded="full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-base-subtle p-4 space-y-3">
            <Skeleton height={18} width={260} />
            <div className="space-y-2">
              <Skeleton height={36} className="w-full" rounded="lg" />
              <Skeleton height={36} className="w-full" rounded="lg" />
              <Skeleton height={36} className="w-full" rounded="lg" />
            </div>
            <Skeleton height={12} width={80} />
          </div>
        ))}
      </div>
    </div>
  );
}
