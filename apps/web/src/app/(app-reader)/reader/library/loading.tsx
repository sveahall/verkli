import { CardSkeleton } from "@/components/ui/states";

export default function LibraryLoading() {
  return (
    <div className="section-gap">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
