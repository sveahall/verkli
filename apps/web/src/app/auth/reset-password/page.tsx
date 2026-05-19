"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { resolveErrorMessage } from "@/lib/error-messages";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setHasSession(!!data.session);
      })
      .catch((err) => {
        // Without this the invalid-link warning never surfaces on transient
        // network errors — the page stays in its initial null-loading state.
        console.warn("[reset-password] getSession failed", err);
        setHasSession(false);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(!!session);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const validate = () => {
    const nextErrors: { password?: string; confirm?: string } = {};
    if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }
    if (!confirm.trim()) {
      nextErrors.confirm = "Confirm your password.";
    } else if (password !== confirm) {
      nextErrors.confirm = "Passwords do not match.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(resolveErrorMessage(null, "Could not update password. Please try again."));
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <AuthShell backHref="/" backLabel="Back to home">
      <AuthCard title="Set a new password" subtitle="Reset password">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {hasSession === false && (
          <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50/80 px-4 py-3 text-sm text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-100">
            This link is invalid or expired. Request a new reset link.
          </div>
        )}

        {success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            Password updated. You can now sign in.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label="New password" error={fieldErrors.password}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required

              />
            </FormField>

            <FormField label="Confirm password" error={fieldErrors.confirm}>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required

              />
            </FormField>

            <Button
              type="submit"
              fullWidth
              isLoading={loading}
              loadingText="Updating"
              disabled={hasSession === false}
            >
              Update password
            </Button>
          </form>
        )}

        <div className="mt-6 flex flex-col gap-2 text-sm text-slate-600 dark:text-white/50">
          <span>Back to sign in:</span>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/author/signin" className="font-semibold text-slate-900 dark:text-white">
              Author sign in
            </Link>
            <span className="text-slate-400 dark:text-white/30">|</span>
            <Link href="/reader/signin" className="font-semibold text-slate-900 dark:text-white">
              Reader sign in
            </Link>
          </div>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
