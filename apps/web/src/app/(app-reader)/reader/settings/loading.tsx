import { Skeleton, CardSkeleton } from "@/components/ui/states";

export default function ReaderSettingsLoading() {
  return (
    <div className="section-gap">
      <Skeleton className="mb-2 h-7 w-32" />
      <Skeleton className="mb-6 h-4 w-56" />
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
