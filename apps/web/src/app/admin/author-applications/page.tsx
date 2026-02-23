"use client";

import { useMemo, useState } from "react";

type AuthorApplicationStatus = "pending" | "approved" | "rejected";

type AuthorApplication = {
  user_id: string;
  email: string | null;
  status: AuthorApplicationStatus;
  created_at: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminAuthorApplicationsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [applications, setApplications] = useState<AuthorApplication[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

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
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-700 dark:text-white/80">
              {pendingCount} pending of {applications.length} total
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 dark:border-white/10 dark:text-white/60">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">User ID</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => {
                  const isSaving = savingUserId === application.user_id;
                  return (
                    <tr
                      key={application.user_id}
                      className="border-b border-slate-100 align-top dark:border-white/5"
                    >
                      <td className="px-3 py-3 text-slate-800 dark:text-white">
                        {application.email ?? "Unknown email"}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-white/60">
                        {application.user_id}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-white/80">
                          {application.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-white/60">
                        {formatDate(application.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isSaving || application.status === "approved"}
                            onClick={() => updateStatus(application.user_id, "approved")}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSaving ? "Saving..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={isSaving || application.status === "rejected"}
                            onClick={() => updateStatus(application.user_id, "rejected")}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSaving ? "Saving..." : "Reject"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
