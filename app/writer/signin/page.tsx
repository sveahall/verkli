"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassSurface from "@/components/GlassSurface";
import LightRays from "@/components/LightRays";
import { signIn, signInWithGoogle } from "@/lib/supabase/auth";
import ThemeToggle from "@/components/ThemeToggle";

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

export default function WriterSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signIn(email, password, staySignedIn);

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/writer");
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  return (
    <main 
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background text-foreground transition-colors duration-300"
    >
      {/* Light rays background - only in dark mode */}
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

      {/* Light mode gradient background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100 dark:hidden" />

      {/* Logo and Theme Toggle */}
      <header className="absolute left-8 top-8 z-20 flex w-full items-center justify-between px-8">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logo-dark.svg"
            alt="Verkli"
            className="h-8 w-auto dark:hidden"
            loading="eager"
          />
          <img
            src="/favicon.svg"
            alt="Verkli"
            className="hidden h-8 w-auto dark:block"
            loading="eager"
          />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle glassProps={glassBaseProps} />
        </div>
      </header>

      {/* Sign in card */}
      <GlassSurface
        {...glassBaseProps}
        width="480px"
        height="auto"
        borderRadius={40}
        className="glass-card relative z-10 border border-black/10 dark:border-white/10"
      >
        <div className="flex w-full flex-col items-center px-12 py-14 text-center">
          <p className="text-base font-medium tracking-wide text-slate-600 dark:text-white/50">
            Welcome back, writer
          </p>
          
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white">
            Sign in to your
            <br />
            account
          </h1>

          {error && (
            <div className="mt-4 w-full rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

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
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:border-[#907AFF]/50 focus:outline-none focus:ring-1 focus:ring-[#907AFF]/50"
              />
            </div>

            <div className="flex flex-col gap-2 text-left">
              <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-white/60">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:border-[#907AFF]/50 focus:outline-none focus:ring-1 focus:ring-[#907AFF]/50"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={staySignedIn}
                  onChange={(e) => setStaySignedIn(e.target.checked)}
                  className="h-4 w-4 rounded border-black/20 dark:border-white/20 bg-white dark:bg-black/20 text-[#907AFF] focus:ring-[#907AFF]/50 focus:ring-offset-0"
                />
                <span className="text-sm text-slate-700 dark:text-white/70">Stay signed in</span>
              </label>
              <Link
                href="/writer/forgot-password"
                className="text-sm text-slate-600 dark:text-white/50 transition hover:text-slate-900 dark:hover:text-white/70"
              >
                Forgot password?
              </Link>
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
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </GlassSurface>
          </form>

          <div className="mt-6 flex w-full items-center gap-4">
            <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            <span className="text-sm text-slate-500 dark:text-white/30">or</span>
            <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-8 py-4 text-[15px] font-medium text-slate-900 dark:text-white/90 transition hover:bg-black/10 dark:hover:bg-white/10"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <p className="mt-8 text-sm text-slate-600 dark:text-white/40">
            Don&apos;t have an account?{" "}
            <Link
              href="/writer/signup"
              className="text-slate-900 dark:text-white/70 transition hover:text-slate-700 dark:hover:text-white"
            >
              Sign up
            </Link>
          </p>
        </div>
      </GlassSurface>
    </main>
  );
}
