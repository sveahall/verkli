import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0.12,
  blur: 12,
  saturation: 1.2,
  mixBlendMode: "screen",
};

type ProfileHeaderProps = {
  displayName: string;
  username: string;
  bio: string;
  avatarUrl?: string | null;
  isPublic: boolean;
};

export default function ProfileHeader({
  displayName,
  username,
  bio,
  avatarUrl,
  isPublic,
}: ProfileHeaderProps) {
  return (

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="relative h-20 w-20 overflow-hidden rounded-full border border-white/80 bg-gradient-to-br from-[#907AFF]/30 via-[#B892FF]/30 to-[#E29ED5]/30 dark:border-white/30">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[28px] font-medium text-slate-900 dark:text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white md:text-[32px]">
                {displayName}
              </h1>
              <span className={`rounded-full border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${
                isPublic
                  ? "border-blue-200/80 bg-gray-100/60 text-blue-600 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-amber-200/80 bg-blue-300/60 text-amber-600 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300"
              }`}>
                {isPublic ? "Public" : "Private"}
              </span>
            </div>
            <p className="text-[14px] font-medium text-slate-500 dark:text-white/50">@{username}</p>
            <p className="max-w-[520px] text-[15px] leading-[1.6] text-slate-600 dark:text-white/60">
              {bio}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/author/settings"
            title="Edit your public author profile"
            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-5 py-2 text-[13px] font-semibold text-slate-700 transition-all hover:-translate-0.25 hover:bg-black/2 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:bg-white/[0.06]"
          >
            <svg
              className="h-4 w-4 text-slate-500 dark:text-white/60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L9.5 17.79 5 19l1.21-4.5 10.652-10.013Z" />
            </svg>
            <span>Edit profile</span>
          </Link>
        </div>
      </div>
  );
}
