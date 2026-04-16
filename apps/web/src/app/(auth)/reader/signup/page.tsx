"use client";

import { useState } from "react";
import Link from "next/link";
import { resolveErrorMessage } from "@/lib/error-messages";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signUp, signInWithGoogle } from "@/lib/supabase/auth";

export default function ReaderSignUp() {
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
    } else if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
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

    const { error } = await signUp(email, password, "reader");

    if (error) {
      setError(resolveErrorMessage(null, "Registration failed. Please try again."));
      setLoading(false);
    } else {
      setSuccess(true);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const { error } = await signInWithGoogle();
    if (error) {
      setError(resolveErrorMessage(null, "Registration failed. Please try again."));
    }
  };

  if (success) {
    return (
      <AuthShell backHref="/reader" backLabel="Back to reader home">
        <AuthCard title="Check your email" subtitle="Almost there">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50/60 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
              We sent a confirmation link to <span className="font-medium text-slate-900 dark:text-white">{email}</span>.
              Open it to activate your account.
            </p>
            <Link href="/reader/signin" className="mt-2 w-full">
              <Button variant="secondary" fullWidth>Back to sign in</Button>
            </Link>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell backHref="/reader" backLabel="Back to reader home">
      <AuthCard title="Create your reader account" subtitle="Start your journey">
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200/80 bg-red-50/60 px-4 py-3 text-[14px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Email" error={fieldErrors.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              fullWidth
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
              fullWidth
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
              fullWidth
            />
          </FormField>

          <Button type="submit" fullWidth isLoading={loading} loadingText="Creating account..." className="mt-1">
            Create account
          </Button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-100 dark:bg-white/[0.06]" />
          <span className="text-[13px] text-slate-400 dark:text-white/25">or</span>
          <div className="h-px flex-1 bg-slate-100 dark:bg-white/[0.06]" />
        </div>

        <Button type="button" variant="secondary" fullWidth onClick={handleGoogleSignIn}>
          Continue with Google
        </Button>

        <p className="mt-8 text-center text-[14px] text-slate-500 dark:text-white/40">
          Already have an account?{" "}
          <Link href="/reader/signin" className="font-medium text-slate-900 hover:underline dark:text-white">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
