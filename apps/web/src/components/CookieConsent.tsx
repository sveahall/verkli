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
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-300 md:left-6 md:right-auto">
      <div className="rounded-[22px] border border-border bg-card/95 px-5 py-5 shadow-surface-lg backdrop-blur-xl">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          We use essential cookies to run the platform and optional analytics
          cookies to improve it.{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-accent-foreground"
          >
            Privacy Policy
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConsent("accepted")}
            className="btn-primary px-4 text-[13px]"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => setConsent("declined")}
            className="btn-secondary px-4 text-[13px]"
          >
            Essential only
          </button>
        </div>
      </div>
    </div>
  );
}
