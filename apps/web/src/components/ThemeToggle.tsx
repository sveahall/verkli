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
  } catch (error) {}

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
}: ThemeToggleProps) {
  const { className: glassPropsClassName = "", ...restGlassProps } = glassProps;
  const [theme, setTheme] = useState<Theme>("light");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const preferred = getPreferredTheme();
    setTheme(preferred);
    applyTheme(preferred);
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {}
    applyTheme(theme);
  }, [theme, isMounted]);

  const isDark = theme === "dark";

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
        className={`flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-transparent text-slate-700 transition-colors hover:text-slate-900 dark:border-white/10 dark:text-white/80 dark:hover:text-white ${className}`.trim()}
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
        className={`flex m-auto p-auto h-5 w-5 bg-transparent items-center justify-center rounded-full text-slate-900 transition-colors dark:text-white ${className}`.trim()}
        aria-pressed={isDark}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {icon}
      </button>
    </GlassSurface>
  );
}
