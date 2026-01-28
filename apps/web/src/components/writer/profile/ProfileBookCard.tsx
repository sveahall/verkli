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
      title={title}
      className="group relative overflow-hidden rounded-[24px] border border-black/10 bg-black/[0.02] transition-all hover:-translate-y-1 hover:border-black/20 hover:shadow-xl dark:border-white/[0.08] dark:bg-white/[0.02]"
    >
      <div
        className="h-[200px] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: cover }}
      />
      <div className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="text-[12px] text-slate-500 dark:text-white/40">Standalone book</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {status ? (
              <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/50">
                {status}
              </span>
            ) : null}
            <div className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white/90 text-slate-500 shadow-sm dark:border-white/15 dark:bg-slate-900/90 dark:text-white/70">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 5h8v8" />
                  <path d="M7 17 17 7" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
