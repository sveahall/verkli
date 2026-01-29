"use client";

import { useState } from "react";
import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";
import LightRays from "@/components/LightRays";
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

export default function WriterForgotPassword() {
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
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background text-foreground transition-colors duration-300">
      <div className="absolute inset-0 z-0 dark:block hidden">
        <LightRays
          raysOrigin="top-center"
          raysColor="#907aff"
          raysSpeed={1.5}
          lightSpread={0.8}
          rayLength={3}
          followMouse={true}
          mouseInfluence={0.6}
          noiseAmount={0.33}
          distortion={0}
          pulsating={false}
          fadeDistance={0.9}
          saturation={2}
        />
      </div>

      <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100 dark:hidden" />

      <header className="absolute left-8 top-8 z-20 flex w-full items-center justify-between px-8">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo-dark.svg" alt="Verkli" className="h-8 w-auto dark:hidden" loading="eager" />
          <img src="/favicon.svg" alt="Verkli" className="hidden h-8 w-auto dark:block" loading="eager" />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle glassProps={glassBaseProps} />
        </div>
      </header>

      <GlassSurface
        {...glassBaseProps}
        width="480px"
        height="auto"
        borderRadius={40}
        className="glass-card relative z-10 border border-black/10 dark:border-white/10"
      >
        <div className="flex w-full flex-col items-center px-12 py-14 text-center">
          <p className="text-base font-medium tracking-wide text-slate-600 dark:text-white/50">
            Reset your password
          </p>
          <h1 className="mt-4 text-[32px] font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white">
            Get back in
          </h1>

          {error && (
            <div className="mt-4 w-full rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
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
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/2 dark:bg-white/5 px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:border-[#907AFF]/50 focus:outline-none focus:ring-1 focus:ring-[#907AFF]/50"
                />
              </div>

              <GlassSurface
                {...glassBaseProps}
                width="100%"
                height="auto"
                borderRadius={999}
                className="glass-button mt-2 w-full"
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-8 py-4 text-[15px] font-medium text-slate-900 dark:text-white/90 disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </GlassSurface>
            </form>
          )}

          <p className="mt-8 text-sm text-slate-600 dark:text-white/40">
            Remembered it?{" "}
            <Link href="/writer/signin" className="text-slate-900 dark:text-white/70 transition hover:text-slate-700 dark:hover:text-white">
              Back to sign in
            </Link>
          </p>
        </div>
      </GlassSurface>
    </main>
  );
}
