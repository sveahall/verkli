"use client";

import { useState } from "react";
import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";
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

export default function ForgotPassword() {
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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0d0b14]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-1/4 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-700/40 blur-[180px]" />
        <div className="absolute bottom-0 left-1/2 h-[600px] w-[900px] -translate-x-1/2 translate-y-1/3 rounded-full bg-purple-600/35 blur-[150px]" />
        <div className="absolute right-0 top-1/2 h-[500px] w-[500px] -translate-y-1/2 translate-x-1/4 rounded-full bg-indigo-500/25 blur-[120px]" />
      </div>

      <header className="absolute left-8 top-8 z-20">
        <Link href="/" className="flex items-center gap-3">
          <img src="/favicon.svg" alt="Verkli" className="h-8 w-auto" loading="eager" />
        </Link>
      </header>

      <GlassSurface
        {...glassBaseProps}
        width="480px"
        height="auto"
        borderRadius={40}
        className="relative z-10 border border-white/10"
      >
        <div className="flex w-full flex-col items-center px-12 py-14 text-center">
          <p className="text-base font-medium tracking-wide text-white/50">Reset password</p>
          <h1 className="mt-4 text-[32px] font-semibold leading-[1.15] tracking-tight text-white">
            Recover your account
          </h1>

          {error && (
            <div className="mt-4 w-full rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {success ? (
            <div className="mt-6 w-full rounded-lg bg-emerald-500/10 px-4 py-4 text-sm text-emerald-300">
              Check your email for a reset link. It may take a minute.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <label htmlFor="email" className="text-sm font-medium text-white/60">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                />
              </div>

              <GlassSurface
                {...glassBaseProps}
                width="100%"
                height="auto"
                borderRadius={999}
                backgroundOpacity={0.25}
                className="mt-2 w-full border border-white/10 transition-transform hover:scale-[1.02]"
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-8 py-4 text-[15px] font-medium text-white/90 disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </GlassSurface>
            </form>
          )}

          <p className="mt-8 text-sm text-white/40">
            Remembered it?{" "}
            <Link href="/signin" className="text-white/70 transition hover:text-white">
              Back to sign in
            </Link>
          </p>
        </div>
      </GlassSurface>
    </main>
  );
}
