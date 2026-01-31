"use client";

import { useState, useEffect } from "react";
import AuroraBackground from "@/components/AuroraBackground";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

const STORAGE_KEY = "verkli_access_submitted";

type Intent = "writer" | "reader";

type SubmitState = "idle" | "loading" | "submitted" | "error";

export default function WaitlistPage() {
  const [intent, setIntent] = useState<Intent>("writer");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") setState("submitted");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMessage("Email required.");
      setState("error");
      return;
    }
    if (!validateEmail(trimmed)) {
      setErrorMessage("Invalid email.");
      setState("error");
      return;
    }
    setState("loading");
    setErrorMessage("");
    const url = intent === "writer" ? "/api/waitlist" : "/api/waitlist/reader";
    const body =
      intent === "writer"
        ? { email: trimmed, role: "author", source: "waitlist_page" }
        : { email: trimmed, source: "waitlist_page" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error || "Failed.");
        setState("error");
        return;
      }
      if (data.ok !== true) {
        setErrorMessage(data.error || "Failed.");
        setState("error");
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        /* ignore */
      }
      setState("submitted");
    } catch {
      setErrorMessage("Failed.");
      setState("error");
    }
  };

  return (
    <>
      <style>{`
        @keyframes waitlist-hero-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .waitlist-hero-in {
          animation: waitlist-hero-in 0.7s ease-out both;
        }
        .waitlist-hero-in-delay-1 { animation-delay: 0.1s; }
        .waitlist-hero-in-delay-2 { animation-delay: 0.2s; }
        .waitlist-cta {
          box-shadow: 0 0 32px rgba(144, 122, 255, 0.25);
        }
        .dark .waitlist-cta {
          box-shadow: 0 0 40px rgba(144, 122, 255, 0.35);
        }
      `}</style>
      <main className="waitlist-page relative flex min-h-screen min-h-dvh flex-col" role="main">
        <AuroraBackground />
        <section className="relative flex min-h-screen min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16 dark">
          <div
            className="waitlist-hero-in absolute left-0 right-0 top-15 flex justify-center pt-8 sm:pt-10"
            aria-hidden
          >
            <div className="flex items-center">
              <img src="/logo-dark.svg" alt="" className="h-7 w-auto dark:hidden" />
              <img src="/favicon.svg" alt="" className="hidden h-7 w-auto dark:block" />
            </div>
          </div>

          <div className="waitlist-hero-in waitlist-hero-in-delay-1 mx-auto w-full max-w-md text-center">
            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[32px]">
              Verkli is for writers who publish and readers who follow.
            </h1>
            <p className="mt-4 text-[15px] text-white/50">
              Access is limited.
            </p>

            {hydrated && (
              <div className="waitlist-hero-in waitlist-hero-in-delay-2 mt-12 w-full">
                {state === "submitted" ? (
                  <p className="text-[14px] text-white/40">We&apos;ll be in touch.</p>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label htmlFor="intent" className="block text-[13px] text-white/40 mb-1.5">
                        What do you write or read?
                      </label>
                      <select
                        id="intent"
                        value={intent}
                        onChange={(e) => setIntent(e.target.value as Intent)}
                        disabled={state === "loading"}
                        className="w-full min-h-[52px] rounded-2xl border border-white/20 bg-white/5 px-5 py-3 text-[15px] text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-0 disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                      >
                        <option value="writer">Writer</option>
                        <option value="reader">Reader</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-[13px] text-white/40 mb-1.5">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (state === "error") setState("idle");
                        }}
                        placeholder="Email"
                        disabled={state === "loading"}
                        autoComplete="email"
                        aria-invalid={state === "error"}
                        aria-describedby={state === "error" ? "waitlist-error" : undefined}
                        className="w-full min-h-[52px] rounded-2xl border border-white/20 bg-white/5 px-5 py-3 text-[15px] text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-0 disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={state === "loading"}
                      className="waitlist-cta w-full min-h-[52px] rounded-2xl bg-slate-900 px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
                      aria-busy={state === "loading"}
                    >
                      {state === "loading" ? "…" : "Request access"}
                    </button>
                    {errorMessage && (
                      <p id="waitlist-error" className="text-[13px] text-white/50" role="alert">
                        {errorMessage}
                      </p>
                    )}
                  </form>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
