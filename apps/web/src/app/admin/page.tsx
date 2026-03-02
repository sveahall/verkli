"use client";

import { useState } from "react";
import Link from "next/link";

type HealthStatus = {
  app: boolean;
  db: boolean;
  redis: boolean;
} | null;

export default function AdminDashboardPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [health, setHealth] = useState<HealthStatus>(null);
  const [error, setError] = useState("");

  const authenticate = async () => {
    setError("");
    try {
      // Test the key by hitting the users endpoint
      const res = await fetch("/api/admin/users?page=1", {
        headers: { "x-admin-key": adminKey.trim() },
      });
      if (!res.ok) {
        setError("Invalid admin key");
        return;
      }
      setAuthenticated(true);

      // Fetch health status
      const healthRes = await fetch("/api/health");
      if (healthRes.ok) {
        setHealth(await healthRes.json());
      }
    } catch {
      setError("Connection failed");
    }
  };

  if (!authenticated) {
    return (
      <main className="mx-auto w-full max-w-lg px-6 py-16">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900 dark:text-white">
          Admin Panel
        </h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/[0.02]">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-white/80">
            Admin API key
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && authenticate()}
              placeholder="Paste ADMIN_API_KEY"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 dark:border-white/20 dark:bg-black/20 dark:text-white"
            />
            <button
              type="button"
              onClick={authenticate}
              disabled={adminKey.trim().length === 0}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
            >
              Login
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-semibold text-slate-900 dark:text-white">
        Admin Panel
      </h1>

      {/* System Health */}
      {health && (
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
          <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-white/80">
            System Health
          </h2>
          <div className="flex flex-wrap gap-4">
            <StatusPill label="App" ok={health.app} />
            <StatusPill label="Database" ok={health.db} />
            <StatusPill label="Redis" ok={health.redis} />
          </div>
        </section>
      )}

      {/* Navigation Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminCard
          title="Author Applications"
          description="Review and approve author applications"
          href="/admin/author-applications"
        />
        <AdminCard
          title="User Management"
          description="Search users, toggle beta access"
          href="/admin/users"
        />
        <AdminCard
          title="Book Moderation"
          description="Browse and moderate published books"
          href="/admin/books"
        />
      </div>
    </main>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm dark:border-white/10">
      <span
        className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      />
      <span className="text-slate-700 dark:text-white/80">{label}</span>
    </div>
  );
}

function AdminCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"
    >
      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">
        {description}
      </p>
    </Link>
  );
}
