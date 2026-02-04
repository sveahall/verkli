"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/supabase/auth";

export default function AuthorForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

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
    <AuthShell backHref="/author" backLabel="Back to Verkli">
      <AuthCard title="Reset your password" subtitle="Get back in">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            Check your email for a reset link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </FormField>

            <Button type="submit" fullWidth isLoading={loading} loadingText="Sending">
              Send reset link
            </Button>
          </form>
        )}

        <p className="mt-6 text-sm text-slate-600 dark:text-white/50">
          Remembered it?{" "}
          <Link href="/author/signin" className="font-semibold text-slate-900 dark:text-white">
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
