"use client";

import Link from "next/link";
import { useState } from "react";
import { resolveErrorMessage } from "@/lib/error-messages";

type ApplicationStatus = "none" | "pending" | "approved" | "rejected";

type Props = {
  initialStatus: ApplicationStatus;
};

export default function AuthorApplicationCard({ initialStatus }: Props) {
  const [status, setStatus] = useState<ApplicationStatus>(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitApplication = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/author-applications", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(resolveErrorMessage(data?.error));
        return;
      }

      const nextStatus = String(data?.status ?? "pending") as ApplicationStatus;
      setStatus(nextStatus === "approved" ? "approved" : "pending");
    } catch {
      setError("Could not submit application");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "approved") {
    return (
      <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
        <p className="font-semibold">Författarstatus godkänd.</p>
        <Link href="/author/home" className="mt-1 inline-block underline underline-offset-4">
          Gå till författarvyn
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300/40 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
      <p className="font-semibold">Ansök om författarkonto</p>
      {status === "pending" ? (
        <p className="mt-1">Din ansökan är inskickad och väntar på admin-beslut.</p>
      ) : status === "rejected" ? (
        <p className="mt-1">Din senaste ansökan avslogs. Du kan skicka in en ny.</p>
      ) : (
        <p className="mt-1">Du behöver godkännande innan du kan publicera böcker.</p>
      )}
      <button
        type="button"
        onClick={submitApplication}
        disabled={submitting || status === "pending"}
        className="mt-3 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "pending" ? "Ansökan skickad" : submitting ? "Skickar..." : "Ansök"}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}
