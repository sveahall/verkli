import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="section-gap-lg">
      <PageHeader
        eyebrow="Discover"
        title={<Skeleton className="h-8 w-56" />}
        description="Loading picks"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="card-base p-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="mt-3 h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
