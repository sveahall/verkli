import { CardSkeleton } from "@/components/ui/states";

export default function ClubsLoading() {
  return (
    <div className="section-gap">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
