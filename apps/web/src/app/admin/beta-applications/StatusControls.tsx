"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Status = "pending" | "accepted" | "rejected";

const ACTIONS: { value: Status; label: string }[] = [
  { value: "accepted", label: "Accept" },
  { value: "rejected", label: "Reject" },
  { value: "pending", label: "Reset" },
];

/**
 * What accepting or reversing actually did to the applicant's access. An empty
 * string means there is nothing worth saying — the invitation already matched
 * the decision.
 */
const INVITATION_NOTICE = {
  invited: "Invited — they get beta access when they sign up.",
  withdrawn: "Invitation withdrawn. Anyone who already signed up keeps their access.",
  already_invited: "",
  not_invited: "",
  no_waitlist_row: "No waitlist entry linked, so no invitation was sent. Invite this address from Beta invitations.",
  failed: "Could not update the invitation. The decision was saved; try again.",
} as const;

export default function StatusControls({
  id,
  status,
}: {
  id: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const setStatus = async (next: Status) => {
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/beta-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        setError(data.error ?? "Update failed");
        return;
      }
      // Say what the decision actually did. Accepting used to be a label with
      // no effect; now it can invite, and an admin needs to see which of those
      // happened — especially the cases where it did neither.
      setNotice(INVITATION_NOTICE[data.invitation?.state as keyof typeof INVITATION_NOTICE] ?? "");
      startTransition(() => router.refresh());
    } catch {
      setError("Update failed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACTIONS.filter((action) => action.value !== status).map((action) => (
        <button
          key={action.value}
          type="button"
          onClick={() => setStatus(action.value)}
          disabled={pending}
          className="min-h-[36px] rounded-full border border-slate-300 px-4 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
        >
          {action.label}
        </button>
      ))}
      {error ? (
        <span className="text-[13px] text-red-600" role="alert">
          {error}
        </span>
      ) : null}
      {notice ? (
        <span className={`text-[13px] ${notice.startsWith("No ") || notice.startsWith("Could") ? "text-amber-700" : "text-slate-600"}`} role="status">
          {notice}
        </span>
      ) : null}
    </div>
  );
}
