"use client";

import { useState } from "react";

type UserRow = {
  user_id: string;
  email: string | null;
  role: string;
  display_name: string | null;
  username: string | null;
  created_at: string;
  beta_enabled: boolean;
};

export default function AdminUsersPage() {
  const [adminKey, setAdminKey] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadUsers = async (pageNum = 1, query = search) => {
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum) });
      if (query) params.set("q", query);

      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { "x-admin-key": adminKey.trim() },
      });

      if (!res.ok) {
        setError("Could not load users. Verify ADMIN_API_KEY.");
        return;
      }

      const json = await res.json();
      setUsers(json.users ?? []);
      setTotal(json.total ?? 0);
      setPage(pageNum);
      setLoaded(true);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  };

  const toggleBeta = async (userId: string, enable: boolean) => {
    setTogglingId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey.trim(),
        },
        body: JSON.stringify({ userId, betaEnabled: enable }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId ? { ...u, beta_enabled: enable } : u
          )
        );
      }
    } catch {
      // silent
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-white">
        User Management
      </h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-white/50">
        Search users and manage beta access.
      </p>

      {/* Auth + Search */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Admin API key"
            className="w-48 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none dark:border-white/20 dark:bg-black/20 dark:text-white"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadUsers(1)}
            placeholder="Search name or username..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none dark:border-white/20 dark:bg-black/20 dark:text-white"
          />
          <button
            type="button"
            onClick={() => loadUsers(1)}
            disabled={loading || !adminKey.trim()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {!loaded ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-600 dark:border-white/20 dark:text-white/60">
          Enter your admin key and search to load users.
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm dark:border-white/10 dark:bg-white/[0.02] dark:text-white/60">
          No users found.
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500 dark:text-white/50">
            {total} user{total !== 1 ? "s" : ""} total
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 dark:border-white/10 dark:text-white/60">
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Beta</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.user_id}
                    className="border-b border-slate-100 dark:border-white/5"
                  >
                    <td className="px-4 py-3 text-slate-800 dark:text-white">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-white/70">
                      {u.display_name || u.username || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-white/10">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-white/50">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={togglingId === u.user_id}
                        onClick={() => toggleBeta(u.user_id, !u.beta_enabled)}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                          u.beta_enabled
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/10 dark:text-white/50"
                        }`}
                      >
                        {u.beta_enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 50 && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => loadUsers(page - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/10"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-slate-500">
                Page {page}
              </span>
              <button
                type="button"
                disabled={page * 50 >= total}
                onClick={() => loadUsers(page + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/10"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
