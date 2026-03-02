import { Skeleton } from "@/components/ui/Skeleton";

export default function InboxLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <Skeleton height={28} width={160} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-base-subtle flex items-center gap-3 p-3">
              <Skeleton height={40} width={40} rounded="full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton height={14} width={120} />
                <Skeleton height={12} className="w-3/4" />
              </div>
            </div>
          ))}
        </div>
        <div className="card-base-subtle flex items-center justify-center p-12">
          <Skeleton height={16} width={200} />
        </div>
      </div>
    </div>
  );
}
