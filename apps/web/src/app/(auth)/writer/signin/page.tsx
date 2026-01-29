"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassCard, { glassCardProps } from "@/components/GlassCard";
import GlassSurface from "@/components/GlassSurface";
import LightRays from "@/components/LightRays";
import { signIn, signInWithGoogle } from "@/lib/supabase/auth";
import ThemeToggle from "@/components/ThemeToggle";

export default function WriterSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const mainRef = useRef<HTMLElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signIn(email, password, staySignedIn);

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/writer/home");
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setMousePos({ x, y });
  };


  return (
    <main 
      ref={mainRef}
      onMouseMove={handleMouseMove}
      className="relative flex min-h-screen min-h-svh flex-col items-center justify-center overflow-hidden bg-background text-foreground transition-colors duration-300"
    >
      {/* Simple mouse-tracked radial gradient background */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#907AFF]/10 via-[#E29ED5]/8 to-[#FCC997]/10 dark:from-slate-900/95 dark:via-purple-950/90 dark:to-slate-900/95" />
        
        {/* Single mouse-tracked radial gradient circle with smooth continuous movement */}
        <div 
          className="absolute h-[700px] w-[700px] rounded-full blur-[100px] pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(144, 122, 255, 0.4) 0%, rgba(226, 158, 213, 0.3) 30%, rgba(252, 201, 151, 0.25) 50%, transparent 70%)',
            left: `${mousePos.x * 100}%`,
            top: `${mousePos.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            willChange: 'left, top',
          }}
        />
      </div>

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
          noiseAmount={0}
          distortion={0}
          pulsating={false}
          fadeDistance={0.9}
          saturation={2}
        />
      </div>




      {/* Logo */}
      <header className="absolute left-8 top-8 z-30">
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
      </header>

      {/* Theme Toggle - bottom right */}
      <div className="absolute bottom-8 right-8 z-30">
        <ThemeToggle glassProps={glassCardProps} />
      </div>

      {/* Sign in card – samma GlassCard som selector/signup */}
      <GlassCard>
        <div className="flex w-full flex-col items-center px-6 py-10 text-center sm:px-10 sm:py-12 md:px-12 md:py-14">
          <p className="text-sm font-medium tracking-wide text-slate-600 dark:text-white/50 sm:text-base">
            Welcome back, writer
          </p>
          
          <h1 className="mt-3 text-2xl font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white sm:mt-4 sm:text-3xl md:text-[36px]">
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
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.05] px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:border-[#907AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/30 focus:ring-offset-0 min-h-[44px]"
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
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.05] px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:border-[#907AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/30 focus:ring-offset-0 min-h-[44px]"
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
              {...glassCardProps}
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
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/5 px-8 py-4 text-[15px] font-medium text-slate-900 dark:text-white/90 transition hover:bg-black/10 dark:hover:bg-white/10"
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
      </GlassCard>
    </main>
  );
}
