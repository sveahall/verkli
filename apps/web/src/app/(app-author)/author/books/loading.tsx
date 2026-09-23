import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <main className="page-content py-10">
      <div className="section-gap">
        <PageHeader
          title="Books"
          description="Manage drafts, translations, and publishing in one place."
          actions={<Skeleton className="h-11 w-36 rounded-full" />}
        />

        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </Card>

        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="p-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
