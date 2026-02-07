import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="page-content py-8">
      <div className="section-gap">
        <Breadcrumbs items={[{ label: "Discover", href: "/reader/discover" }, { label: "Loading" }]} />
        <PageHeader title={<Skeleton className="h-7 w-48" />} description="Loading chapter" />
        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <Card className="p-6">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-full" />
              ))}
            </div>
          </Card>
          <Card className="p-8">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-6 h-4 w-64" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-full" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
