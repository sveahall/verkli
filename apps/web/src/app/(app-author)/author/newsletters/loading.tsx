import { Skeleton } from "@/components/ui/Skeleton";

export default function NewslettersLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <Skeleton height={28} width={180} />
        <Skeleton height={36} width={140} rounded="full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-base-subtle p-4 space-y-2">
            <Skeleton height={18} width={240} />
            <Skeleton height={14} className="w-2/3" />
            <Skeleton height={12} width={100} />
          </div>
        ))}
      </div>
    </div>
  );
}
