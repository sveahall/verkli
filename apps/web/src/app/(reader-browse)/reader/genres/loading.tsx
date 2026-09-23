import { Skeleton } from "@/components/ui/Skeleton";

export default function GenresLoading() {
  return (
    <div className="section-gap-lg animate-in fade-in duration-300">
      <div className="space-y-3">
        <Skeleton height={12} width={60} rounded="full" />
        <Skeleton height={32} width={180} />
        <Skeleton height={16} width={280} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} height={48} rounded="xl" />
        ))}
      </div>
    </div>
  );
}
