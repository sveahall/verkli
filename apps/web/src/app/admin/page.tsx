import Link from "next/link";
import { checkDbHealth, checkRedisHealth } from "@/lib/health/checks";

type HealthStatus = {
  app: boolean;
  db: boolean;
  redis: boolean;
};

export default async function AdminDashboardPage() {
  const [db, redis] = await Promise.all([checkDbHealth(), checkRedisHealth()]);
  const health: HealthStatus = {
    app: true,
    db,
    redis,
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-semibold text-slate-900 dark:text-white">
        Admin Panel
      </h1>

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
