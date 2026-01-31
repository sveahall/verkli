"use client";

import { useState } from "react";
import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";
import { resetPassword } from "@/lib/supabase/auth";
import { ERROR_COPY } from "@/lib/copy-rules";

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0,
  blur: 8,
  saturation: 1,
  mixBlendMode: "difference",
};

export default function ReaderForgotPassword() {
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
      setError(ERROR_COPY.INVALID_LOGIN);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <main
      className="relative flex min-h-screen min-h-dvh flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-6 text-slate-900 dark:text-white"
      style={{ background: "var(--auth-background)" }}
    >
      <header className="absolute left-4 top-4 z-20 sm:left-8 sm:top-8">
        <Link href="/" className="flex min-h-[44px] min-w-[44px] items-center gap-3 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 rounded-lg">
          <img src="/favicon.svg" alt="Verkli" className="h-8 w-auto" loading="eager" />
        </Link>
      </header>

      <GlassSurface
        {...glassBaseProps}
        width="100%"
        height="auto"
        borderRadius={24}
        className="glass-card relative z-10 w-full max-w-[480px]"
      >
        <div className="flex w-full flex-col items-center px-6 py-10 text-center sm:px-12 sm:py-14">
          <p className="text-base font-medium tracking-wide text-slate-600 dark:text-white/50">
            Reset your password
          </p>
          <h1 className="mt-4 text-[32px] font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white">
            Welcome back
          </h1>

          {error && (
            <div className="mt-4 w-full rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {success ? (
            <div className="mt-6 w-full rounded-lg bg-emerald-500/10 px-4 py-4 text-sm text-emerald-300">
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
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-black/[0.02] px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/30 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
              </div>

              <GlassSurface
                {...glassBaseProps}
                width="100%"
                height="auto"
                borderRadius={999}
                backgroundOpacity={0.25}
                className="mt-2 w-full border border-black/10 transition-transform hover:scale-[1.02] dark:border-white/10"
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[44px] w-full px-8 py-4 text-[15px] font-medium text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 dark:text-white/90"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </GlassSurface>
            </form>
          )}

          <p className="mt-8 text-sm text-slate-600 dark:text-white/40">
            Remembered it?{" "}
            <Link href="/reader/signin" className="text-slate-900 transition hover:text-slate-700 dark:text-white/70 dark:hover:text-white">
              Back to sign in
            </Link>
          </p>
        </div>
      </GlassSurface>
    </main>
  );
}
