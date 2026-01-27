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
      href={`/writer/shelves/${id}`}
      className="group relative overflow-hidden rounded-[24px] border border-black/10 bg-black/[0.02] transition-all hover:-translate-y-1 hover:border-black/20 hover:shadow-xl dark:border-white/[0.08] dark:bg-white/[0.02]"
    >
      <div
        className="h-[180px] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: background }}
      />
      <div className="space-y-2 p-5">
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">
          {name}
        </h3>
        <p className="text-[13px] text-slate-600 dark:text-white/50">
          {subtitle || "Curated shelf"}
        </p>
      </div>
    </Link>
  );
}
