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
      className="flex min-w-[220px] flex-1 items-center gap-4 rounded-2xl border border-border bg-card/80 px-4 py-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-[background-color,border-color,color,box-shadow] duration-300 hover:border-[#907AFF]/25 hover:bg-card/90 hover:shadow-[0_12px_32px_-8px_rgba(144,122,255,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-card dark:hover:border-[#907AFF]/20 dark:hover:bg-card dark:hover:shadow-[0_12px_32px_-8px_rgba(144,122,255,0.1)] dark:focus-visible:ring-offset-background"
    >
      <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#907AFF]/15 to-[#E29ED5]/15 text-[14px] font-semibold text-muted-foreground ring-2 ring-white/80 dark:from-[#907AFF]/20 dark:to-[#E29ED5]/20 dark:ring-white/10">
        {avatar ? (
          <Image src={avatar} alt={name} fill sizes="48px" className="object-cover" />
        ) : (
          name
            .split(" ")
            .map((word) => word[0])
            .slice(0, 2)
            .join("")
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-foreground">{name}</p>
        <p className="truncate text-[12px] text-muted-foreground">{genre ?? "Storyteller"}</p>
        {metaText && (
          <p className="text-[11px] text-muted-foreground">{metaText}</p>
        )}
      </div>
    </Link>
  );
}
