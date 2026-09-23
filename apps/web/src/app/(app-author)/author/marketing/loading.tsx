import { CardSkeleton } from "@/components/ui/states";

export default function MarketingLoading() {
  return (
    <div className="section-gap">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
