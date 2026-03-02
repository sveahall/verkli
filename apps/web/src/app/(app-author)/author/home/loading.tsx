import { Skeleton } from "@/components/ui/Skeleton";

export default function AuthorHomeLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <div className="card-base-subtle p-6 space-y-4">
        <Skeleton height={28} width={240} />
        <Skeleton height={16} width={360} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-base-subtle p-4 space-y-2">
            <Skeleton height={12} width={100} />
            <Skeleton height={28} width={60} />
          </div>
        ))}
      </div>
      <div className="card-base-subtle p-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={48} className="w-full" />
        ))}
      </div>
    </div>
  );
}
