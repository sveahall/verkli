import Link from "next/link";

type ShelfCardProps = {
  id: string;
  name: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  coverType?: string | null;
  coverGradient?: string | null;
};

const fallbackGradient = "linear-gradient(135deg, #907AFF 0%, #E29ED5 50%, #FCC997 100%)";

const resolveCoverBackground = (coverType?: string | null, coverUrl?: string | null, coverGradient?: string | null) => {
  if (coverType === "image" && coverUrl) {
    return `url(${coverUrl})`;
  }

  if (coverType === "gradient" && coverGradient) {
    // Stored gradient can be raw CSS or a JSON payload.
    if (coverGradient.includes("gradient")) {
      return coverGradient;
    }
    try {
      const parsed = JSON.parse(coverGradient);
      if (parsed?.from && parsed?.to) {
        const angle = parsed.angle ?? 135;
        return `linear-gradient(${angle}deg, ${parsed.from}, ${parsed.to})`;
      }
    } catch (error) {}
  }

  return fallbackGradient;
};

export default function ProfileShelfCard({
  id,
  name,
  subtitle,
  coverUrl,
  coverType,
  coverGradient,
}: ShelfCardProps) {
  const background = resolveCoverBackground(coverType, coverUrl, coverGradient);

  return (
    <Link
      href={`/author/shelves/${id}`}
      title={name}
      className="group relative overflow-hidden rounded-[24px] border border-black/10 bg-black/[0.02] transition-all hover:-translate-y-1 hover:border-black/20 dark:border-white/[0.08] dark:bg-white/[0.02]"
    >
      <div
        className="h-[180px] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: background }}
      />
      <div className="space-y-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
              {name}
            </h3>
            <p className="text-[13px] text-slate-600 dark:text-white/50">
              {subtitle || "Curated shelf"}
            </p>
          </div>
          <div className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white/90 text-slate-500 dark:border-white/[0.15] dark:bg-slate-900/90 dark:text-white/70">
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
    </Link>
  );
}
