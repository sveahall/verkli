"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signIn, signInWithGoogle } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { resolveErrorMessage } from "@/lib/error-messages";

export default function ReaderSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = "Email is required.";
    if (!password.trim()) nextErrors.password = "Password is required.";
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setLoading(true);
    const { error } = await signIn(email, password, staySignedIn);

    if (error) {
      setError(resolveErrorMessage(null, "Inloggningen misslyckades. Kontrollera e-post och lösenord."));
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
    router.push(resolvedRole === "author" ? "/author/home" : "/reader/home");
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const { error } = await signInWithGoogle();
    if (error) {
      setError(resolveErrorMessage(null, "Inloggningen misslyckades. Kontrollera e-post och lösenord."));
    }
  };

  return (
    <AuthShell backHref="/reader" backLabel="Back to reader home">
      <AuthCard title="Sign in to your account" subtitle="Welcome back, reader">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormField label="Email" error={fieldErrors.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              invalid={Boolean(fieldErrors.email)}
            />
          </FormField>

          <FormField label="Password" error={fieldErrors.password}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              invalid={Boolean(fieldErrors.password)}
            />
          </FormField>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-white/70">
              <input
                type="checkbox"
                checked={staySignedIn}
                onChange={(e) => setStaySignedIn(e.target.checked)}
                className="h-4 w-4 rounded border-black/20 bg-white text-[#907AFF] focus:ring-[#907AFF]/50 dark:border-white/20 dark:bg-black/20"
              />
              Stay signed in
            </label>
            <Link
              href="/reader/forgot-password"
              className="text-sm text-slate-600 transition hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth isLoading={loading} loadingText="Signing in">
            Sign in
          </Button>
        </form>

        <div className="my-6 flex w-full items-center gap-4">
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          <span className="text-sm text-slate-500 dark:text-white/30">or</span>
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        <Button type="button" variant="secondary" fullWidth onClick={handleGoogleSignIn}>
          Continue with Google
        </Button>

        <p className="mt-6 text-sm text-slate-600 dark:text-white/50">
          Don&apos;t have an account?{" "}
          <Link href="/reader/signup" className="font-semibold text-slate-900 dark:text-white">
            Create one
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
