"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signUp, signInWithGoogle } from "@/lib/supabase/auth";
import { resolveErrorMessage } from "@/lib/error-messages";

export default function AuthorSignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validate = () => {
    const nextErrors: { email?: string; password?: string; confirmPassword?: string } = {};
    if (!email.trim()) nextErrors.email = "Email is required.";
    if (!password.trim()) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }
    if (!confirmPassword.trim()) {
      nextErrors.confirmPassword = "Confirm your password.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setLoading(true);

    const { error } = await signUp(email, password, "author");

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  if (success) {
    return (
      <AuthShell backHref="/author" backLabel="Back to Verkli">
        <AuthCard title="Check your email" subtitle="Almost there">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-slate-600 dark:text-white/60">
              We sent a confirmation link to <span className="font-semibold text-slate-900 dark:text-white">{email}</span>.
              Open it to activate your account.
            </p>
            <Link href="/author/signin" className="btn-secondary w-full justify-center">
              Back to sign in
            </Link>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell backHref="/author" backLabel="Back to Verkli">
      <AuthCard title="Create your author account" subtitle="Start your journey">
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
              autoComplete="new-password"
              required
              invalid={Boolean(fieldErrors.password)}
            />
          </FormField>

          <FormField label="Confirm password" error={fieldErrors.confirmPassword}>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              invalid={Boolean(fieldErrors.confirmPassword)}
            />
          </FormField>

          <Button type="submit" fullWidth isLoading={loading} loadingText="Creating account">
            Create account
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
          Already have an account?{" "}
          <Link href="/author/signin" className="font-semibold text-slate-900 dark:text-white">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
