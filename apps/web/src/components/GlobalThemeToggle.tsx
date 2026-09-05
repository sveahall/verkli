"use client";

import { useEffect, useRef } from "react";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Fast tema-växling i nedre högra hörnet – syns på alla sidor.
 */
export default function GlobalThemeToggle() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mobileNav: HTMLElement | null = null;

    const updateOffset = () => {
      const navHeight = mobileNav?.getBoundingClientRect().height ?? 0;
      container.style.bottom = navHeight > 0
        ? `${navHeight + 16}px`
        : "1.25rem";
    };

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateOffset);

    const syncNavigation = () => {
      const nextNav = document.querySelector<HTMLElement>("[data-mobile-bottom-nav]");
      if (nextNav !== mobileNav) {
        if (mobileNav) resizeObserver?.unobserve(mobileNav);
        mobileNav = nextNav;
        if (mobileNav) resizeObserver?.observe(mobileNav);
      }
      updateOffset();
    };

    const mutationObserver = new MutationObserver(syncNavigation);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", syncNavigation);
    window.visualViewport?.addEventListener("resize", syncNavigation);
    syncNavigation();

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncNavigation);
      window.visualViewport?.removeEventListener("resize", syncNavigation);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-[9999] flex items-center justify-center"
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
