import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <main className="page-content py-10">
      <div className="section-gap">
        <Skeleton className="h-4 w-40" />
        <PageHeader
          title={<Skeleton className="h-8 w-64" />}
          description="Loading book details"
          actions={<Skeleton className="h-11 w-32 rounded-full" />}
        />
        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="p-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-3 h-32 w-full" />
              </Card>
            ))}
          </div>
          <Card className="p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-80 w-full" />
          </Card>
        </div>
      </div>
    </main>
  );
}
