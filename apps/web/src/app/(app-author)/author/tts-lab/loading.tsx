import { Skeleton } from "@/components/ui/Skeleton";

export default function TtsLabLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <div className="card-base-subtle p-6 space-y-4">
        <Skeleton height={28} width={220} />
        <Skeleton height={16} width={360} />
      </div>
      <div className="card-base-subtle p-6 space-y-4">
        <Skeleton height={48} className="w-full" />
        <Skeleton height={120} className="w-full" />
        <Skeleton height={40} width={160} />
      </div>
    </div>
  );
}
