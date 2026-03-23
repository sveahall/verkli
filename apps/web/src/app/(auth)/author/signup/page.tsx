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

type ApplicationStep = "info" | "published" | "link" | "submitted";

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

  // Questionnaire state
  const [step, setStep] = useState<ApplicationStep>("info");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [hasPublishedBefore, setHasPublishedBefore] = useState<boolean | null>(null);
  const [publishedBooksUrl, setPublishedBooksUrl] = useState("");
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

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
        if (user.email) setContactEmail(user.email);

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

  const submitApplication = async () => {
    setApplicationError("");
    setApplicationLoading(true);

    try {
      const response = await fetch("/api/author-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email: contactEmail,
          hasPublishedBefore: hasPublishedBefore ?? false,
          publishedBooksUrl: hasPublishedBefore ? publishedBooksUrl : null,
        }),
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
      setStep("submitted");

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

  const handleNextFromInfo = () => {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "First name is required.";
    if (!lastName.trim()) errors.lastName = "Last name is required.";
    if (!contactEmail.trim()) errors.contactEmail = "Email is required.";
    setStepErrors(errors);
    if (Object.keys(errors).length === 0) {
      setStep("published");
    }
  };

  const handlePublishedAnswer = (answer: boolean) => {
    setHasPublishedBefore(answer);
    if (answer) {
      setStep("link");
    } else {
      void submitApplication();
    }
  };

  const handleSubmitWithLink = () => {
    const errors: Record<string, string> = {};
    if (!publishedBooksUrl.trim()) errors.publishedBooksUrl = "Please add a link to your published books.";
    setStepErrors(errors);
    if (Object.keys(errors).length === 0) {
      void submitApplication();
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
    const isPending = applicationStatus === "pending" || step === "submitted";

    if (isApproved) {
      return (
        <AuthShell backHref="/reader/home" backLabel="Back to reader home">
          <AuthCard title="Author access approved" subtitle="You're ready to publish">
            {applicationError && (
              <div role="alert" className="mb-5 rounded-xl border border-red-200/80 bg-red-50/60 px-4 py-3 text-[14px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {applicationError}
              </div>
            )}
            <div className="flex flex-col gap-4">
              <p className="text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
                Signed in as <span className="font-medium text-slate-900 dark:text-white">{loggedInEmail}</span>. Your author access is already approved.
              </p>
              <Button fullWidth isLoading={applicationLoading} loadingText="Opening author home..." onClick={async () => { setApplicationLoading(true); await switchToAuthorMode(); setApplicationLoading(false); }}>
                Open author home
              </Button>
            </div>
          </AuthCard>
        </AuthShell>
      );
    }

    if (isPending) {
      return (
        <AuthShell backHref="/reader/home" backLabel="Back to reader home">
          <AuthCard title="Thank you for your application!" subtitle="We'll be in touch">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50/60 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
                {hasPublishedBefore
                  ? "Thank you for your application! We'll review your information and get back to you soon."
                  : "Thank you for your application! We'll get back to you shortly about whether you can join."}
              </p>
              <Link href="/reader/home" className="mt-2 w-full">
                <Button variant="secondary" fullWidth>Back to reader home</Button>
              </Link>
            </div>
          </AuthCard>
        </AuthShell>
      );
    }

    // Multi-step questionnaire
    return (
      <AuthShell backHref="/reader/home" backLabel="Back to reader home">
        <AuthCard
          title={
            step === "info" ? "Apply to become an author"
              : step === "published" ? "Your publishing experience"
                : "Your published books"
          }
          subtitle={
            step === "info" ? "Tell us about yourself"
              : step === "published" ? "Step 2 of 3"
                : "Step 3 of 3"
          }
        >
          {applicationError && (
            <div role="alert" className="mb-5 rounded-xl border border-red-200/80 bg-red-50/60 px-4 py-3 text-[14px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {applicationError}
            </div>
          )}

          {step === "info" && (
            <div className="flex flex-col gap-4">
              <p className="text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
                Signed in as <span className="font-medium text-slate-900 dark:text-white">{loggedInEmail}</span>
              </p>

              <FormField label="First name" error={stepErrors.firstName}>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Your first name" autoComplete="given-name" fullWidth />
              </FormField>

              <FormField label="Last name" error={stepErrors.lastName}>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Your last name" autoComplete="family-name" fullWidth />
              </FormField>

              <FormField label="Email address" error={stepErrors.contactEmail}>
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" fullWidth />
              </FormField>

              <Button fullWidth onClick={handleNextFromInfo} className="mt-1">
                Continue
              </Button>
            </div>
          )}

          {step === "published" && (
            <div className="flex flex-col gap-4">
              <p className="text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
                Have you published books before?
              </p>

              <div className="flex flex-col gap-3">
                <Button fullWidth isLoading={applicationLoading && hasPublishedBefore === false} loadingText="Submitting..." onClick={() => handlePublishedAnswer(true)}>
                  Yes, I have published books
                </Button>
                <Button variant="secondary" fullWidth isLoading={applicationLoading && hasPublishedBefore === false} loadingText="Submitting..." onClick={() => handlePublishedAnswer(false)}>
                  No, not yet
                </Button>
              </div>

              <button type="button" onClick={() => setStep("info")} className="mt-1 text-[13px] text-slate-400 transition hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60">
                Go back
              </button>
            </div>
          )}

          {step === "link" && (
            <div className="flex flex-col gap-4">
              <p className="text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
                Where can we find your published books? Add a link so we can check them out.
              </p>

              <FormField label="Link to your published books" error={stepErrors.publishedBooksUrl}>
                <Input type="url" value={publishedBooksUrl} onChange={(e) => setPublishedBooksUrl(e.target.value)} placeholder="https://..." fullWidth />
              </FormField>

              <Button fullWidth isLoading={applicationLoading} loadingText="Submitting..." onClick={handleSubmitWithLink} className="mt-1">
                Submit application
              </Button>

              <button type="button" onClick={() => setStep("published")} className="mt-1 text-[13px] text-slate-400 transition hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60">
                Go back
              </button>
            </div>
          )}
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
