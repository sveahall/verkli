import Link from "next/link";
import {
  UserCheck,
  Users,
  BookOpen,
  Rocket,
  ListChecks,
  ArrowRight,
} from "lucide-react";
import { checkDbHealth, checkRedisHealth } from "@/lib/health/checks";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadQueueRows, summarizeBacklog } from "@/lib/queues/admin-queue-stats";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function countTable(
  admin: ReturnType<typeof createAdminClient>,
  table: string
): Promise<number | null> {
  try {
    const { count, error } = await admin
      .from(table as never)
      .select("*", { count: "exact", head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function countPendingApplications(
  admin: ReturnType<typeof createAdminClient>
): Promise<number | null> {
  try {
    const { count, error } = await admin
      .from("author_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  const [db, redis, queueRows, pendingApplications, totalUsers, totalBooks] =
    await Promise.all([
      checkDbHealth(),
      checkRedisHealth(),
      loadQueueRows(),
      countPendingApplications(admin),
      countTable(admin, "profiles"),
      countTable(admin, "books"),
    ]);

  const backlog = summarizeBacklog(queueRows);

  const stats: StatItem[] = [
    {
      label: "Pending applications",
      value: pendingApplications,
      href: "/admin/author-applications",
      highlight: (pendingApplications ?? 0) > 0,
    },
    { label: "Users", value: totalUsers, href: "/admin/users" },
    { label: "Books", value: totalBooks, href: "/admin/books" },
    {
      label: "Queue backlog",
      value: backlog.redisAvailable ? backlog.pending : null,
      href: "/admin/queues",
      highlight: (backlog.pending ?? 0) > 0,
    },
  ];

  return (
    <div className="page-content py-10">
      <PageHeader
        eyebrow="Admin"
        title="Dashboard"
        description="Platform health, moderation queue and operational overview."
      />

      {/* Live stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* System health */}
      <section className="mt-8">
        <h2 className="text-eyebrow mb-3">System health</h2>
        <Card className="px-5 py-4">
          <div className="flex flex-wrap gap-3">
            <HealthPill label="App" ok />
            <HealthPill label="Database" ok={db} />
            <HealthPill label="Redis" ok={redis} />
            {backlog.failed > 0 && (
              <Badge variant="error">
                {backlog.failed} failed job{backlog.failed === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </Card>
      </section>

      {/* Navigation */}
      <section className="mt-8">
        <h2 className="text-eyebrow mb-3">Manage</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NavCard
            title="Author Applications"
            description="Review questionnaires, approve or reject applicants."
            href="/admin/author-applications"
            icon={UserCheck}
            badge={
              (pendingApplications ?? 0) > 0
                ? { label: `${pendingApplications} pending`, variant: "warning" }
                : undefined
            }
          />
          <NavCard
            title="Users"
            description="Browse profiles, roles, activity and beta access."
            href="/admin/users"
            icon={Users}
          />
          <NavCard
            title="Books"
            description="Read chapters, listen to audio and moderate content."
            href="/admin/books"
            icon={BookOpen}
          />
          <NavCard
            title="Beta"
            description="Soft-launch cohort funnel and retention."
            href="/admin/beta"
            icon={Rocket}
          />
          <NavCard
            title="Queues"
            description="BullMQ job counts and failure inspection."
            href="/admin/queues"
            icon={ListChecks}
          />
        </div>
      </section>
    </div>
  );
}

type StatItem = {
  label: string;
  value: number | null;
  href: string;
  highlight?: boolean;
};

function StatCard({ label, value, href, highlight }: StatItem) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white px-5 py-5 transition-colors hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"
    >
      <div className="text-stat tabular-nums text-slate-900 dark:text-white">
        {value === null ? "—" : value.toLocaleString("en-US")}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[13px] text-slate-500 dark:text-white/50">{label}</span>
        {highlight && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" aria-hidden />}
      </div>
    </Link>
  );
}

function HealthPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Badge variant={ok ? "success" : "error"}>
      {label} {ok ? "OK" : "Down"}
    </Badge>
  );
}

type NavCardProps = {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { label: string; variant: "warning" | "success" | "info" | "error" | "brand" | "neutral" };
};

function NavCard({ title, description, href, icon: Icon, badge }: NavCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80">
          <Icon className="h-5 w-5" />
        </span>
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
      </div>
      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-slate-400 transition-colors group-hover:text-slate-700 dark:group-hover:text-white/80">
        Open <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
