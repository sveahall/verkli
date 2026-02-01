"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";
import { createClient } from "@/lib/supabase/client";

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

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(!!session);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
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
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-1/4 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-300/60 blur-[180px] dark:bg-purple-700/40" />
        <div className="absolute bottom-0 left-1/2 h-[600px] w-[900px] -translate-x-1/2 translate-y-1/3 rounded-full bg-purple-300/50 blur-[150px] dark:bg-purple-600/35" />
        <div className="absolute right-0 top-1/2 h-[500px] w-[500px] -translate-y-1/2 translate-x-1/4 rounded-full bg-indigo-300/40 blur-[120px] dark:bg-indigo-500/25" />
      </div>

      <GlassSurface
        {...glassBaseProps}
        width="100%"
        height="auto"
        borderRadius={24}
        className="relative z-10 w-full max-w-[480px] border border-black/10 dark:border-white/10"
      >
        <div className="flex w-full flex-col items-center px-6 py-10 text-center sm:px-12 sm:py-14">
          <p className="text-base font-medium tracking-wide text-slate-600 dark:text-white/50">Set a new password</p>
          <h1 className="mt-4 text-[32px] font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white">
            Reset password
          </h1>

          {error && (
            <div className="mt-4 w-full rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {hasSession === false && (
              <div className="mt-6 w-full rounded-lg bg-yellow-500/10 px-4 py-4 text-sm text-yellow-700 dark:text-yellow-200">
                This link is invalid or expired. Request a new reset link.
              </div>
          )}

          {success ? (
            <div className="mt-6 w-full rounded-lg bg-emerald-500/10 px-4 py-4 text-sm text-emerald-700 dark:text-emerald-300">
              Password updated. You can now sign in.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 flex w-full flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-white/60">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="min-h-[44px] w-full rounded-xl border border-black/10 bg-black/[0.02] px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/30 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
              </div>

              <div className="flex flex-col gap-2 text-left">
                <label htmlFor="confirm" className="text-sm font-medium text-slate-700 dark:text-white/60">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
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
                  disabled={loading || hasSession === false}
                  className="min-h-[44px] w-full px-8 py-4 text-[15px] font-medium text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 dark:text-white/90"
                >
                  {loading ? "Updating..." : "Update password"}
                </button>
              </GlassSurface>
            </form>
          )}

          <p className="mt-8 text-sm text-slate-600 dark:text-white/40">
            <Link href="/author/signin" className="text-slate-900 transition hover:text-slate-700 dark:text-white/70 dark:hover:text-white">
              Back to sign in
            </Link>
          </p>
        </div>
      </GlassSurface>
    </main>
  );
}
