"use client";

import { useMemo, useState } from "react";

type AuthorApplicationStatus = "pending" | "approved" | "rejected";

type AuthorApplication = {
  user_id: string;
  auth_email: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  has_published_before: boolean | null;
  published_books_url: string | null;
  status: AuthorApplicationStatus;
  created_at: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function StatusBadge({ status }: { status: AuthorApplicationStatus }) {
  const colors: Record<AuthorApplicationStatus, string> = {
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
    approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
    rejected: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${colors[status]}`}>
      {status}
    </span>
  );
}

function ApplicationDetail({ application, onExpand }: { application: AuthorApplication; onExpand: () => void }) {
  const name = [application.first_name, application.last_name].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full text-left"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-600 dark:bg-white/10 dark:text-white/70">
          {application.first_name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
            {name || "No name provided"}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-white/50">
            {application.email ?? application.auth_email ?? "No email"}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function AdminAuthorApplicationsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [applications, setApplications] = useState<AuthorApplication[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => applications.filter((application) => application.status === "pending").length,
    [applications]
  );

  const loadApplications = async () => {
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/author-applications", {
        headers: {
          "x-admin-key": adminKey.trim(),
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError("Could not load applications. Verify ADMIN_API_KEY and try again.");
        return;
      }

      setApplications(Array.isArray(payload?.applications) ? payload.applications : []);
      setLoaded(true);
    } catch {
      setError("Could not load applications. Verify ADMIN_API_KEY and try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (userId: string, status: AuthorApplicationStatus) => {
    setError("");
    setSavingUserId(userId);

    try {
      const response = await fetch("/api/admin/author-applications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey.trim(),
        },
        body: JSON.stringify({ userId, status }),
      });

      if (!response.ok) {
        setError("Could not update application status. Verify ADMIN_API_KEY and try again.");
        return;
      }

      setApplications((current) =>
        current.map((application) =>
          application.user_id === userId ? { ...application, status } : application
        )
      );
    } catch {
      setError("Could not update application status. Verify ADMIN_API_KEY and try again.");
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Admin: Author Applications
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
          Review pending reader applications and approve author access.
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-white/80">
          Admin API key
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="password"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="Paste ADMIN_API_KEY"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-white/20 dark:bg-black/20 dark:text-white"
          />
          <button
            type="button"
            onClick={loadApplications}
            disabled={loading || adminKey.trim().length === 0}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
          >
            {loading ? "Loading..." : "Load applications"}
          </button>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      {!loaded ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-600 dark:border-white/20 dark:text-white/60">
          Enter your admin key to load author applications.
        </div>
      ) : applications.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/60">
          No author applications found.
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-700 dark:text-white/80">
              <span className="font-semibold text-amber-600 dark:text-amber-400">{pendingCount} pending</span> of {applications.length} total
            </p>
          </div>

          <div className="space-y-3">
            {applications.map((application) => {
              const isSaving = savingUserId === application.user_id;
              const isExpanded = expandedUserId === application.user_id;
              const name = [application.first_name, application.last_name].filter(Boolean).join(" ");

              return (
                <div
                  key={application.user_id}
                  className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]"
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between gap-4 p-4">
                    <ApplicationDetail
                      application={application}
                      onExpand={() => setExpandedUserId(isExpanded ? null : application.user_id)}
                    />

                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={application.status} />
                      <span className="hidden text-xs text-slate-400 dark:text-white/40 sm:inline">
                        {formatDate(application.created_at)}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isSaving || application.status === "approved"}
                          onClick={() => updateStatus(application.user_id, "approved")}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSaving ? "..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={isSaving || application.status === "rejected"}
                          onClick={() => updateStatus(application.user_id, "rejected")}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSaving ? "..." : "Reject"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 py-4 dark:border-white/5">
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-white/40">Name</p>
                          <p className="mt-0.5 text-slate-800 dark:text-white">{name || "Not provided"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-white/40">Contact email</p>
                          <p className="mt-0.5 text-slate-800 dark:text-white">{application.email ?? "Not provided"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-white/40">Auth email</p>
                          <p className="mt-0.5 text-slate-800 dark:text-white">{application.auth_email ?? "Unknown"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-white/40">User ID</p>
                          <p className="mt-0.5 font-mono text-xs text-slate-600 dark:text-white/60">{application.user_id}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-white/40">Published before?</p>
                          <p className="mt-0.5 text-slate-800 dark:text-white">
                            {application.has_published_before === true
                              ? "Yes"
                              : application.has_published_before === false
                                ? "No"
                                : "Not answered"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-white/40">Published books link</p>
                          {application.published_books_url ? (
                            <a
                              href={application.published_books_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 inline-block text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
                            >
                              {application.published_books_url}
                            </a>
                          ) : (
                            <p className="mt-0.5 text-slate-400 dark:text-white/30">None</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-white/40">Applied</p>
                          <p className="mt-0.5 text-slate-800 dark:text-white">{formatDate(application.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
