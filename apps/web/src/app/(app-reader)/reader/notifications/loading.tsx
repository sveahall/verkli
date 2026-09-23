import { Skeleton } from "@/components/ui/states";

export default function NotificationsLoading() {
  return (
    <div className="section-gap">
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
