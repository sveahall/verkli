import Link from "next/link";
import Image from "next/image";

type AuthorCardProps = {
  name: string;
  avatar?: string | null;
  genre?: string;
  followers?: string;
  meta?: string;
  href?: string;
};

export default function AuthorCard({ name, avatar, genre, followers, meta, href = "#" }: AuthorCardProps) {
  const metaText = meta ?? (followers ? `${followers} followers` : null);

  return (
    <Link
      href={href}
      className="flex min-w-[220px] flex-1 items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:focus-visible:ring-offset-[#0b0b12]"
    >
      <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-slate-100 text-[14px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-white/70">
        {avatar ? (
          <Image src={avatar} alt={name} fill sizes="48px" className="object-cover" unoptimized />
        ) : (
          name
            .split(" ")
            .map((word) => word[0])
            .slice(0, 2)
            .join("")
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{name}</p>
        <p className="text-[12px] text-slate-500 dark:text-white/60 truncate">{genre ?? "Storyteller"}</p>
        {metaText && (
          <p className="text-[11px] text-slate-400 dark:text-white/45">{metaText}</p>
        )}
      </div>
    </Link>
  );
}
