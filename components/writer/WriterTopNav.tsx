import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";
import ThemeToggle from "@/components/ThemeToggle";

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

const navItems = [
  { label: "Dashboard", href: "/writer" },
  { label: "Profile", href: "/writer/profile" },
  { label: "Settings", href: "/writer/settings" },
];

export default function WriterTopNav({ active }: { active?: string }) {
  return (
    <header className="sticky top-6 z-20 mx-auto w-full max-w-[1400px] px-6">
      <GlassSurface
        {...glassBaseProps}
        width="100%"
        height="72px"
        borderRadius={300}
        className="w-full border border-black/10 px-6 py-4 dark:border-white/10 md:px-10 [&_.glass-surface__content]:w-full [&_.glass-surface__content]:justify-between [&_.glass-surface__content]:p-0"
      >
        <nav className="flex w-full items-center justify-between gap-6">
          <div className="flex items-center gap-10">
            <Link href="/writer" className="flex items-center gap-3">
              <img src="/logo-dark.svg" alt="Verkli" className="h-8 w-auto dark:hidden" />
              <img src="/favicon.svg" alt="Verkli" className="hidden h-8 w-auto dark:block" />
            </Link>
            <div className="hidden items-center gap-8 text-[15px] font-medium text-slate-700 dark:text-white/70 md:flex">
              {navItems.map((item) => {
                const isActive = active === item.label;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`transition-colors ${
                      isActive
                        ? "text-slate-900 dark:text-white"
                        : "hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle glassProps={glassBaseProps} />
            <Link
              href="/writer"
              className="hidden rounded-full border border-black/10 bg-black/5 px-4 py-2 text-[13px] font-medium text-slate-700 transition-all hover:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:bg-white/[0.06] md:inline-flex"
            >
              Back to dashboard
            </Link>
          </div>
        </nav>
      </GlassSurface>
    </header>
  );
}
