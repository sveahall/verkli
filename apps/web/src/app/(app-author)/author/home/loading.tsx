import { Skeleton } from "@/components/ui/Skeleton";

export default function AuthorHomeLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="space-y-2">
        <Skeleton height={18} width={160} />
      </div>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-4">
          <Skeleton height={56} width={180} className="rounded-[20px]" />
          <Skeleton height={56} width={180} className="rounded-[20px]" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton height={48} width={180} className="rounded-lg" />
          <Skeleton height={48} width={160} className="rounded-lg" />
          <Skeleton height={48} width={190} className="rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <Skeleton height={48} width={48} className="rounded-full" />
            <Skeleton height={14} width={120} />
            <Skeleton height={40} width={84} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, cardIndex) => (
          <div
            key={cardIndex}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <Skeleton height={28} width={220} />
            {Array.from({ length: 4 }).map((_, rowIndex) => (
              <Skeleton key={rowIndex} height={20} className="w-full" />
            ))}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <Skeleton height={32} width={120} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={52} className="w-full" />
        ))}
      </div>
    </div>
  );
}
