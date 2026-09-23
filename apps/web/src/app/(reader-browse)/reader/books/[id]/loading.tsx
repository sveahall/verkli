import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="section-gap">
      <Breadcrumbs items={[{ label: "Discover", href: "/reader/discover" }, { label: "Loading" }]} />
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-0 overflow-hidden">
          <Skeleton className="h-[360px] w-full" />
        </Card>
        <div className="space-y-6">
          <PageHeader
            title={<Skeleton className="h-8 w-64" />}
            description="Loading book"
            actions={<Skeleton className="h-11 w-40 rounded-full" />}
          />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
    </div>
  );
}
