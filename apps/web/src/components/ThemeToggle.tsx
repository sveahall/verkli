"use client";

import { useEffect, useState, type ComponentProps } from "react";
import GlassSurface from "@/components/GlassSurface";

const STORAGE_KEY = "verkli-theme";

type Theme = "light" | "dark";

type ThemeToggleProps = {
  className?: string;
  glassClassName?: string;
  glassProps?: Partial<ComponentProps<typeof GlassSurface>>;
  useGlass?: boolean;
  id?: string;
  dataThemeToggle?: string;
};

const getPreferredTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {}

  return "light";
};

const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
};

export default function ThemeToggle({
  className = "",
  glassClassName = "",
  glassProps = {},
  useGlass = true,
  id,
  dataThemeToggle,
}: ThemeToggleProps) {
  const { className: glassPropsClassName = "", ...restGlassProps } = glassProps;
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const preferred = getPreferredTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(preferred);
    applyTheme(preferred);
    setMounted(true);
  }, []);

  // When returning from Stripe (or any bfcache restore), reset so we don't hydrate with stale mounted=true vs server HTML.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setMounted(false);
        const preferred = getPreferredTheme();
        setTheme(preferred);
        applyTheme(preferred);
        requestAnimationFrame(() => setMounted(true));
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    applyTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";

  // Fixed placeholder: identical on server and first client render to avoid hydration mismatch
  // (parent className can differ by build/cache; never use it until mounted).
  // Default size 44px (min touch target). Parent can override via className.
  const placeholderClass =
    "flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-700 shadow-sm";

  const buttonClass =
    `flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-slate-700 transition-colors hover:text-slate-900 dark:border-white/10 dark:text-white/80 dark:hover:text-white ${className}`.trim();

  if (!mounted) {
    return (
      <button
        type="button"
        id={id}
        data-theme-toggle={dataThemeToggle}
        className={placeholderClass}
        aria-label="Theme toggle"
        aria-pressed={false}
      >
        <span className="flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        </span>
      </button>
    );
  }

  const icon = isDark ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a1 1 0 0 1 1 1v2" />
      <path d="M12 18a1 1 0 0 1 1 1v2" />
      <path d="M3 12a1 1 0 0 1 1-1h2" />
      <path d="M18 12a1 1 0 0 1 1-1h2" />
      <path d="M5.6 5.6l1.4 1.4" />
      <path d="M17 17l1.4 1.4" />
      <path d="M5.6 18.4 7 17" />
      <path d="M17 7l1.4-1.4" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );

  if (!useGlass) {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        id={id}
        data-theme-toggle={dataThemeToggle}
        className={buttonClass}
        aria-pressed={isDark}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        <span className="flex items-center justify-center">{icon}</span>
      </button>
    );
  }

  return (
    <GlassSurface
      {...restGlassProps}
      width={restGlassProps.width ?? "auto"}
      height={restGlassProps.height ?? "auto"}
      borderRadius={restGlassProps.borderRadius ?? 999}
      className={`glass-surface--button ${glassClassName} ${glassPropsClassName}`.trim()}
    >
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        id={id}
        data-theme-toggle={dataThemeToggle}
        className={`flex m-auto p-auto h-5 w-5 bg-transparent items-center justify-center rounded-full text-slate-900 transition-colors dark:text-white ${className}`.trim()}
        aria-pressed={isDark}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {icon}
      </button>
    </GlassSurface>
  );
}
