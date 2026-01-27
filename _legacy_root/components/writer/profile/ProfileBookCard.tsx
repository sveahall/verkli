import Link from "next/link";

type BookCardProps = {
  id: string;
  title: string;
  coverUrl?: string | null;
  slug?: string | null;
  status?: string | null;
};

const fallbackGradient = "linear-gradient(135deg, #2B2B3A 0%, #111118 100%)";

export default function ProfileBookCard({ id, title, coverUrl, slug, status }: BookCardProps) {
  const href = slug ? `/writer/books/${id}` : `/writer/books/${id}`;
  const cover = coverUrl ? `url(${coverUrl})` : fallbackGradient;

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-[24px] border border-black/10 bg-black/[0.02] transition-all hover:-translate-y-1 hover:border-black/20 hover:shadow-xl dark:border-white/[0.08] dark:bg-white/[0.02]"
    >
      <div
        className="h-[200px] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: cover }}
      />
      <div className="space-y-1.5 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            {title}
          </h3>
          {status ? (
            <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/50">
              {status}
            </span>
          ) : null}
        </div>
        <p className="text-[12px] text-slate-500 dark:text-white/40">Standalone book</p>
      </div>
    </Link>
  );
}
