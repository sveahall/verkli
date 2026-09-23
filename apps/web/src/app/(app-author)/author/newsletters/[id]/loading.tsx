import { Skeleton } from "@/components/ui/Skeleton";

export default function NewsletterDetailLoading() {
  return (
    <div className="section-gap animate-in fade-in duration-300">
      <Skeleton height={28} width={240} />
      <div className="card-base-subtle p-6 space-y-4">
        <Skeleton height={20} width={300} />
        <Skeleton height={16} className="w-full" />
        <Skeleton height={16} className="w-4/5" />
        <Skeleton height={16} className="w-3/5" />
      </div>
    </div>
  );
}
