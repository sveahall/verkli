"use client";

import ThemeToggle from "@/components/ThemeToggle";

/**
 * Fast tema-växling i nedre högra hörnet – syns på alla sidor.
 */
export default function GlobalThemeToggle() {
  return (
    <div
      data-global-theme-control
      className="fixed bottom-5 right-5 z-[9999] flex items-center justify-center"
    >
      <ThemeToggle
        useGlass={false}
        id="global-theme-toggle"
        dataThemeToggle="global"
        className="h-11 w-11 rounded-full border border-border bg-card/95 shadow-surface-md backdrop-blur-xl transition hover:border-ring/50 hover:bg-accent"
      />
    </div>
  );
}
