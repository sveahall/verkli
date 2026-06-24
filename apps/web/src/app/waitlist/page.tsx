"use client";

import { useState, useSyncExternalStore } from "react";
import AuroraBackground from "@/components/AuroraBackground";
import BookOrderSection from "./BookOrderSection";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

const STORAGE_KEY = "verkli_access_submitted";

type Intent = "author" | "reader";

type SubmitState = "idle" | "loading" | "submitted" | "error";

export default function WaitlistPage() {
  const [intent, setIntent] = useState<Intent>("author");
  const [email, setEmail] = useState("");
  // Lazy initializer reads localStorage on the client; gated behind `hydrated`
  // below so server and first client render agree (no hydration mismatch).
  const [state, setState] = useState<SubmitState>(() => {
    if (typeof window === "undefined") return "idle";
    try {
      return localStorage.getItem(STORAGE_KEY) === "true" ? "submitted" : "idle";
    } catch {
      return "idle";
    }
  });
  const [errorMessage, setErrorMessage] = useState("");
  // Detect client mount without useEffect+setState (React-compiler strict).
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

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
    const url = intent === "author" ? "/api/waitlist" : "/api/waitlist/reader";
    const body =
      intent === "author"
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
        .waitlist-hero-in-delay-3 { animation-delay: 0.3s; }
        .waitlist-hero-in-delay-4 { animation-delay: 0.4s; }
        .waitlist-cta {
          box-shadow: 0 0 32px rgba(144, 122, 255, 0.25);
        }
        .dark .waitlist-cta {
          box-shadow: 0 0 40px rgba(144, 122, 255, 0.35);
        }
        @keyframes waitlist-scroll-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
        .waitlist-scroll-cue-icon {
          animation: waitlist-scroll-bounce 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .waitlist-scroll-cue-icon { animation: none; }
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

          <div className="waitlist-hero-in mt-15 waitlist-hero-in-delay-1 mx-auto w-full max-w-lg text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50">
              LIMITED PRE LAUNCH
            </p>
            <h1 className="mt-5 text-[42px] font-semibold leading-[1.2] tracking-tight text-white sm:text-[30px] md:text-[42px]">
              <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">verkli</span> {" "}
              is the future platform for modern storytelling
            </h1>
            <p className="mt-5 text-[15px] leading-snug text-white/55">
              verkli is a new publishing platform built for one thing:
              <br />
              To make it radically easier for authors to publish, grow a community and actually earn money
            </p>
            <p className="mt-4 text-[13px] text-white/45">
              This is a private pre-launch. Early access is invite only.<br />
            </p><br />
            <div className="waitlist-hero-in waitlist-hero-in-delay-3 mt-5 w-full max-w-md mx-auto rounded-3xl border border-white/20 bg-white/5 p-6 shadow-[0_24px_48px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-8">
              <h3 className="text-[15px] font-semibold leading-snug text-white/55 text-center">Sign up below to join the pre-launch waitlist</h3>

              {hydrated ? (
                state === "submitted" ? (
                  <p className="mt-6 text-[14px] text-white/40 text-center">You&apos;re on the waitlist. We&apos;ll be in touch.</p>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                    <div>
                      <p className="block text-[13px] text-white/40 mb-1.5" id="intent-label">
                        Do you write or read?
                      </p>
                      <div
                        role="group"
                        aria-labelledby="intent-label"
                        className="flex rounded-2xl border border-white/20 bg-white/5 p-1 dark:border-white/10 dark:bg-white/5"
                      >
                        {(["author", "reader"] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setIntent(value)}
                            disabled={state === "loading"}
                            aria-pressed={intent === value}
                            className="flex-1 min-h-[44px] rounded-xl py-2.5 text-[15px] font-medium transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                            style={
                              intent === value
                                ? { background: "rgba(255,255,255,0.12)", color: "white" }
                                : { color: "rgba(255,255,255,0.6)" }
                            }
                          >
                            {value === "author" ? "Author" : "Reader"}
                          </button>
                        ))}
                      </div>
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
                      {state === "loading" ? "…" : "Join waitlist"}
                    </button>
                    {errorMessage && (
                      <p id="waitlist-error" className="text-[13px] text-white/50" role="alert">
                        {errorMessage}
                      </p>
                    )}
                  </form>
                )
              ) : null}
            </div>

            <p className="waitlist-hero-in waitlist-hero-in-delay-4 mt-10 text-center text-[11px] text-white/35 tracking-wide">
              No public launch date announced
            </p>
          </div>

          {/* Scroll cue: hints the book-order card sits below the fold (desktop). */}
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("book-order");
              if (!el) return;
              const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
            }}
            aria-label="Beställ Johans bok nedan"
            className="waitlist-hero-in waitlist-hero-in-delay-4 absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 rounded-full px-4 py-2 text-white/45 transition-colors hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:flex"
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.3em]">Beställ boken</span>
            <svg
              className="waitlist-scroll-cue-icon h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </section>

        <BookOrderSection />
      </main>
    </>
  );
}
