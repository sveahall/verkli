"use client";

import { useState } from "react";
import Link from "next/link";
import { resolveErrorMessage } from "@/lib/error-messages";
import GlassSurface from "@/components/GlassSurface";
import ThemeToggle from "@/components/ThemeToggle";
import { resetPassword } from "@/lib/supabase/auth";

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

export default function AuthorForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await resetPassword(email);

    if (error) {
      setError(resolveErrorMessage(null, "Kunde inte skicka återställningslänk. Försök igen."));
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background text-foreground transition-colors duration-300">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100 dark:hidden" />

      <header className="absolute left-6 top-6 z-20 flex w-full items-center justify-between px-6 sm:left-8 sm:top-8 sm:px-8">
        <div className="flex items-center gap-3">
          <Link href="/author" className="flex min-h-[44px] min-w-[44px] items-center" aria-label="Verkli">
            <img src="/logo-dark.svg" alt="Verkli" className="h-8 w-auto dark:hidden" loading="eager" />
            <img src="/favicon.svg" alt="Verkli" className="hidden h-8 w-auto dark:block" loading="eager" />
          </Link>
          <Link href="/author/signin" className="btn-secondary text-[13px] gap-2 px-4 py-2.5">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
            </svg>
            Back to Verkli
          </Link>
        </div>
        <div className="flex items-center">
          <ThemeToggle glassProps={glassBaseProps} />
        </div>
      </header>

      <GlassSurface
        {...glassBaseProps}
        width="480px"
        height="auto"
        borderRadius={40}
        className="glass-card card-auth relative z-10 mx-4 w-full max-w-[480px] border border-black/10 dark:border-white/10 sm:mx-6 md:rounded-[32px]"
      >
        <div className="flex w-full flex-col items-center px-12 py-14 text-center">
          <p className="text-base font-medium tracking-wide text-slate-600 dark:text-white/50">
            Reset your password
          </p>
          <h1 className="mt-4 text-[32px] font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white">
            Get back in
          </h1>

          {error && (
            <div className="mt-4 w-full rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {success ? (
            <div className="mt-6 w-full rounded-lg bg-emerald-500/10 px-4 py-4 text-sm text-emerald-600 dark:text-emerald-300">
              Check your email for a reset link.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-white/60">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="input-base"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary mt-2 w-full"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-8 text-sm text-slate-600 dark:text-white/40">
            Remembered it?{" "}
            <Link href="/author/signin" className="text-slate-900 dark:text-white/70 transition hover:text-slate-700 dark:hover:text-white">
              Back to sign in
            </Link>
          </p>
        </div>
      </GlassSurface>
    </main>
  );
}
