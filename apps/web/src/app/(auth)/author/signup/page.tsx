"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { resolveErrorMessage } from "@/lib/error-messages";
import { signUp, signInWithGoogle } from "@/lib/supabase/auth";

type AuthorApplicationStatus = "none" | "pending" | "approved" | "rejected";

const parseApplicationStatus = (value: unknown): AuthorApplicationStatus => {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "pending" || normalized === "approved" || normalized === "rejected") {
    return normalized;
  }
  return "none";
};

const isExistingSupabaseUser = (
  data: { user?: { identities?: unknown[] | null } | null } | null | undefined
): boolean => {
  const identities = data?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
};

export default function AuthorSignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [applicationError, setApplicationError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);
  const [applicationStatus, setApplicationStatus] = useState<AuthorApplicationStatus>("none");

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    const loadSignedInUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (!user) {
          setLoggedInEmail(null);
          setApplicationStatus("none");
          setLoadingApplication(false);
          return;
        }

        setLoggedInEmail(user.email ?? null);

        try {
          const response = await fetch("/api/author-applications");
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            setApplicationError(
              resolveErrorMessage(
                null,
                "Could not load your author application status. Please refresh and try again."
              )
            );
            setApplicationStatus("none");
            return;
          }
          setApplicationStatus(parseApplicationStatus(payload?.status));
        } finally {
          if (mounted) {
            setLoadingApplication(false);
          }
        }
      } catch {
        if (mounted) {
          setLoggedInEmail(null);
          setApplicationStatus("none");
          setLoadingApplication(false);
        }
      }
    };

    void loadSignedInUser();

    return () => {
      mounted = false;
    };
  }, []);

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

    const { data, error } = await signUp(email, password, "author");

    if (error) {
      setError(resolveErrorMessage(null, "Could not create your account. Please try again."));
      setLoading(false);
      return;
    }

    if (isExistingSupabaseUser(data)) {
      setError("This email already has an account. Sign in first, then apply for author access.");
      setLoading(false);
      return;
    }

    setSuccess(true);
  };

  const switchToAuthorMode = async () => {
    const response = await fetch("/api/auth/active-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "author" }),
    });

    if (!response.ok) {
      setApplicationError(
        "Your author access is approved, but we could not switch your role automatically. Try again."
      );
      return;
    }

    router.push("/author/home");
    router.refresh();
  };

  const handleApplyForAuthor = async () => {
    setApplicationError("");
    setApplicationLoading(true);

    try {
      const response = await fetch("/api/author-applications", {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setApplicationError(
          resolveErrorMessage(null, "Could not submit your author application. Please try again.")
        );
        return;
      }

      const nextStatus = parseApplicationStatus(payload?.status);
      setApplicationStatus(nextStatus === "none" ? "pending" : nextStatus);

      if (nextStatus === "approved") {
        await switchToAuthorMode();
      }
    } catch {
      setApplicationError(
        resolveErrorMessage(null, "Could not submit your author application. Please try again.")
      );
    } finally {
      setApplicationLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  if (loadingApplication) {
    return (
      <AuthShell backHref="/author" backLabel="Back to Verkli">
        <AuthCard title="Preparing author access" subtitle="One moment">
          <p className="text-center text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
            Checking your account status...
          </p>
        </AuthCard>
      </AuthShell>
    );
  }

  if (loggedInEmail) {
    const isApproved = applicationStatus === "approved";
    const isPending = applicationStatus === "pending";
    const isReapply = applicationStatus === "rejected";
    const cardTitle = isApproved
      ? "Author access approved"
      : isPending
        ? "Application pending"
        : isReapply
          ? "Reapply for author access"
          : "Apply for author access";
    const cardSubtitle = isApproved ? "You're ready to publish" : "Use your existing reader account";

    return (
      <AuthShell backHref="/reader/home" backLabel="Back to reader home">
        <AuthCard title={cardTitle} subtitle={cardSubtitle}>
          {applicationError && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-200/80 bg-red-50/60 px-4 py-3 text-[14px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
            >
              {applicationError}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <p className="text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
              Signed in as <span className="font-medium text-slate-900 dark:text-white">{loggedInEmail}</span>.
              {isApproved
                ? " Your author access is already approved."
                : isPending
                  ? " Your author application is pending. Waiting for admin approval."
                  : isReapply
                    ? " Your previous application was rejected. You can submit a new one now."
                    : " Submit an application to unlock author mode on this same account."}
            </p>

            {isApproved ? (
              <Button
                fullWidth
                isLoading={applicationLoading}
                loadingText="Opening author home..."
                onClick={async () => {
                  setApplicationLoading(true);
                  await switchToAuthorMode();
                  setApplicationLoading(false);
                }}
              >
                Open author home
              </Button>
            ) : isPending ? (
              <Link href="/reader/home" className="w-full">
                <Button variant="secondary" fullWidth>Back to reader home</Button>
              </Link>
            ) : (
              <Button fullWidth isLoading={applicationLoading} loadingText="Submitting application..." onClick={handleApplyForAuthor}>
                {isReapply ? "Submit new application" : "Apply for author access"}
              </Button>
            )}
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell backHref="/author" backLabel="Back to Verkli">
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
            <Link href="/author/signin" className="mt-2 w-full">
              <Button variant="secondary" fullWidth>Back to sign in</Button>
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
          <Link href="/author/signin" className="font-medium text-slate-900 hover:underline dark:text-white">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
