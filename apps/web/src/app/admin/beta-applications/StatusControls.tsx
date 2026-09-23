"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Status = "pending" | "accepted" | "rejected";

const ACTIONS: { value: Status; label: string }[] = [
  { value: "accepted", label: "Accept" },
  { value: "rejected", label: "Reject" },
  { value: "pending", label: "Reset" },
];

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

  const setStatus = async (next: Status) => {
    setError("");
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
    </div>
  );
}
