"use client";

import ThemeToggle from "@/components/ThemeToggle";

/**
 * Fast tema-växling i nedre högra hörnet – syns på alla sidor.
 */
export default function GlobalThemeToggle() {
  return (
    <div
      className="fixed bottom-5 right-5 z-[9999] flex items-center justify-center"
      aria-hidden="true"
    >
      <ThemeToggle
        useGlass={false}
        id="global-theme-toggle"
        dataThemeToggle="global"
        className="h-11 w-11 rounded-full border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition hover:bg-white dark:border-white/10 dark:bg-slate-900/90 dark:shadow-black/20 dark:hover:bg-slate-800/90"
      />
    </div>
  );
}
