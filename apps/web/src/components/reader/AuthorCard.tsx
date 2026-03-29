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

export default function AuthorCard({
  name,
  avatar,
  genre,
  followers,
  meta,
  href = "#",
}: AuthorCardProps) {
  const metaText = meta ?? (followers ? `${followers} followers` : null);

  return (
    <Link
      href={href}
      className="flex min-w-[220px] flex-1 items-center gap-4 rounded-xl border border-black/[0.06] bg-white px-4 py-4 shadow-sm transition-[transform,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:shadow-md active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:border-white/[0.06] dark:bg-white/[0.04]"
    >
      <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#907AFF]/10 text-sm font-semibold text-[#907AFF]">
        {avatar ? (
          <Image
            src={avatar}
            alt={name}
            fill
            sizes="48px"
            className="object-cover"
            unoptimized
          />
        ) : (
          name
            .split(" ")
            .map((word) => word[0])
            .slice(0, 2)
            .join("")
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#0F172A] dark:text-white">
          {name}
        </p>
        <p className="truncate text-xs text-[#64748B] dark:text-white/60">
          {genre ?? "Storyteller"}
        </p>
        {metaText && (
          <p className="text-xs text-[#64748B]/70 dark:text-white/45">
            {metaText}
          </p>
        )}
      </div>
    </Link>
  );
}
