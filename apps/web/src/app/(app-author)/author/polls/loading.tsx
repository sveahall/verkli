import { Skeleton } from "@/components/ui/Skeleton";

export default function AuthorPollsLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <div className="card-base-subtle p-6 space-y-4">
        <Skeleton height={28} width={200} />
        <Skeleton height={16} width={320} />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-base-subtle p-5 space-y-3">
            <Skeleton height={20} width={280} />
            <Skeleton height={14} width={160} />
            <div className="space-y-2 pt-2">
              <Skeleton height={32} className="w-full" />
              <Skeleton height={32} className="w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
