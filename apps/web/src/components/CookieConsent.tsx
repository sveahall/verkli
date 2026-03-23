"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

const COOKIE_KEY = "verkli-cookie-consent";

function getSnapshot(): string | null {
  try {
    return localStorage.getItem(COOKIE_KEY);
  } catch {
    return "accepted"; // treat as accepted if storage unavailable
  }
}

function getServerSnapshot(): string | null {
  return "accepted"; // never show banner during SSR
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function setConsent(value: "accepted" | "declined") {
  try {
    localStorage.setItem(COOKIE_KEY, value);
    window.dispatchEvent(new StorageEvent("storage", { key: COOKIE_KEY }));
  } catch {
    // ignore
  }
}

export default function CookieConsent() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (consent !== null) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300 md:left-6 md:right-auto">
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-4 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/95">
        <p className="text-[13px] leading-relaxed text-slate-600 dark:text-white/60">
          We use essential cookies to run the platform and optional analytics
          cookies to improve it.{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white"
          >
            Privacy Policy
          </Link>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConsent("accepted")}
            className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => setConsent("declined")}
            className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
          >
            Essential only
          </button>
        </div>
      </div>
    </div>
  );
}
