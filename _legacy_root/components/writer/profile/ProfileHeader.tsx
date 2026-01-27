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
    <GlassSurface
      {...glassBaseProps}
      width="100%"
      height="auto"
      borderRadius={36}
      className="w-full border border-black/10 px-8 py-8 dark:border-white/[0.08]"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="relative h-24 w-24 overflow-hidden rounded-full border border-black/10 bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20 dark:border-white/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[28px] font-semibold text-slate-900 dark:text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white md:text-[32px]">
                {displayName}
              </h1>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] ${
                isPublic
                  ? "border-emerald-200/80 bg-emerald-100/60 text-emerald-600 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-amber-200/80 bg-amber-100/60 text-amber-600 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300"
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
            href="/writer/settings"
            className="rounded-full border border-black/10 bg-black/5 px-5 py-2 text-[13px] font-semibold text-slate-700 transition-all hover:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:bg-white/[0.06]"
          >
            Edit profile
          </Link>
        </div>
      </div>
    </GlassSurface>
  );
}
