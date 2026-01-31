"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassSurface from "@/components/GlassSurface";
import ThemeToggle from "@/components/ThemeToggle";
import { signIn, signInWithGoogle } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
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

export default function ReaderSignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "expired") setError(ERROR_COPY.EXPIRED_ACCESS);
    else if (reason === "removed") setError(ERROR_COPY.REMOVED_ACCESS);
  }, []);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const mainRef = useRef<HTMLElement>(null);

  const handleMouseMove: (e: React.MouseEvent<HTMLElement>) => void = (e) => {
    if (!mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setMousePos({ x, y });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(ERROR_COPY.INVALID_LOGIN);
      setLoading(false);
    } else {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      let nextRole: "author" | "reader" | null = null;
      const metaRole = user?.user_metadata?.active_role ?? user?.user_metadata?.role;
      if (metaRole === "author" || metaRole === "reader") {
        nextRole = metaRole;
      }

      if (!nextRole && user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, preferences")
          .eq("user_id", user.id)
          .maybeSingle();

        const preferenceRole = (profile?.preferences as { active_role?: string } | null)?.active_role;
        if (preferenceRole === "author" || preferenceRole === "reader") {
          nextRole = preferenceRole;
        } else if (profile?.role === "author" || profile?.role === "reader") {
          nextRole = profile.role;
        }
      }

      const resolvedRole = nextRole ?? "reader";
      router.push(resolvedRole === "reader" ? "/reader/home" : "/author/home");
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const { error } = await signInWithGoogle();
    if (error) {
      setError(ERROR_COPY.INVALID_LOGIN);
    }
  };

  return (
    <main
      ref={mainRef}
      onMouseMove={handleMouseMove}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden text-slate-900 dark:text-white"
      style={{ background: "var(--auth-background)" }}
    >
      <header className="absolute left-6 top-6 z-20 flex items-center gap-3 sm:left-8 sm:top-8">
        <Link href="/" className="flex items-center gap-3">
          <img src="/favicon.svg" alt="verkli" className="h-8 w-auto" loading="eager" />
        </Link>
        <Link href="/reader" className="btn-secondary text-[13px] gap-2 px-4 py-2.5">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </svg>
          Back to verkli
        </Link>
      </header>

      <div className="absolute bottom-8 right-8 z-30">
        <ThemeToggle glassProps={glassBaseProps} />
      </div>

      <GlassSurface
        {...glassBaseProps}
        width="480px"
        height="auto"
        borderRadius={40}
        className="glass-card card-auth relative z-10 mx-4 w-full max-w-[480px] sm:mx-6 md:rounded-[32px]"
      >
        <div className="flex w-full flex-col items-center px-12 py-14 text-center">
          <p className="text-base font-medium tracking-wide text-slate-600 dark:text-white/50">
            Welcome back, reader
          </p>
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white">
            Sign in to your
            <br />
            account
          </h1>

          {error && (
            <div className="mt-4 w-full rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-5">
            <div className="flex flex-col gap-2 text-left">
              <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-white/60">Email</label>
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
            <div className="flex flex-col gap-2 text-left">
              <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-white/60">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="input-base"
              />
            </div>
            <div className="flex justify-end">
              <Link href="/reader/forgot-password" className="text-sm text-slate-600 transition hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70">
                Forgot password?
              </Link>
            </div>
            <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6 flex w-full items-center gap-4">
            <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            <span className="text-sm text-slate-500 dark:text-white/30">or</span>
            <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          </div>

          <button type="button" onClick={handleGoogleSignIn} className="btn-secondary mt-6 w-full">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <p className="mt-8 text-sm text-slate-600 dark:text-white/40">
            Don&apos;t have an account?{" "}
            <Link href="/reader/signup" className="text-slate-900 transition hover:text-slate-700 dark:text-white/70 dark:hover:text-white">
              Sign up
            </Link>
          </p>
        </div>
      </GlassSurface>
    </main>
  );
}
