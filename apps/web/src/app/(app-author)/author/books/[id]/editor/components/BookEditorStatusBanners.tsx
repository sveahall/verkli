"use client";

import Link from "next/link";
import { BookJobsBanner } from "@/components/books/JobStatusBanner";
import type { UnifiedJob } from "@/hooks/useBookJobs";

interface BookEditorStatusBannersProps {
  jobLoading: boolean;
  jobError: string | null;
  jobsForBanner: UnifiedJob[];
  billingPastDue: boolean;
  onJobRetry: (job: UnifiedJob) => Promise<void>;
}

export function BookEditorStatusBanners({
  jobLoading,
  jobError,
  jobsForBanner,
  billingPastDue,
  onJobRetry,
}: BookEditorStatusBannersProps) {
  const jobStatusBanner = jobLoading ? (
    <div
      className="mb-6 flex h-14 items-center rounded-xl border border-black/[0.06] bg-slate-50/50 px-4 dark:border-white/[0.06] dark:bg-white/5"
      role="status"
      aria-label="Loading status"
    >
      <span className="text-sm text-slate-500 dark:text-white/50">Loading status...</span>
    </div>
  ) : jobError ? (
    <div
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30"
      role="alert"
    >
      <p className="text-sm text-amber-800 dark:text-amber-200">{jobError}</p>
    </div>
  ) : jobsForBanner.length > 0 ? (
    <div className="mb-6">
      <BookJobsBanner jobs={jobsForBanner} onRetry={onJobRetry} />
    </div>
  ) : null;

  const billingWarning = billingPastDue ? (
    <div
      className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30"
      role="alert"
    >
      <p className="text-sm text-red-800 dark:text-red-200">
        Your subscription is <strong>past_due</strong>. Billing features are locked until payment is updated.{" "}
        <Link href="/author/billing" className="underline">
          Manage subscription
        </Link>
        .
      </p>
    </div>
  ) : null;

  return (
    <>
      {jobStatusBanner}
      {billingWarning}
    </>
  );
}
