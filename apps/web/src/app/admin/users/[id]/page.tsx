import { notFound } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Globe,
  ShieldCheck,
  Clock,
  CreditCard,
  ScrollText,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRole } from "@/lib/admin-auth";
import { isValidUuid } from "@/lib/api-errors";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/states";

export const dynamic = "force-dynamic";

type BookStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type PageProps = {
  params: Promise<{ id: string }>;
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Data loading — all reads use the service-role admin client and are batched.
 * ───────────────────────────────────────────────────────────────────────────── */

type UserDetail = {
  user_id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  website_url: string | null;
  is_public: boolean;
  social_links: Record<string, string>;
  beta_enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_seen_at: string | null;
  books: {
    total: number;
    breakdown: Record<BookStatus, number>;
    list: Array<{ id: string; title: string; status: BookStatus; created_at: string }>;
  };
  inProgress: Array<{
    book_id: string;
    book_title: string | null;
    progress_percent: number;
    current_chapter: number;
    last_read_at: string;
  }>;
  billing: {
    plan: string | null;
    status: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  audit: Array<{
    id: string;
    action: string;
    actor_role: string | null;
    meta: Record<string, unknown> | null;
    created_at: string;
  }>;
};

async function loadUserDetail(id: string): Promise<UserDetail | null> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "user_id, role, display_name, username, avatar_url, bio, website_url, is_public, social_links, created_at, updated_at"
    )
    .eq("user_id", id)
    .maybeSingle();

  if (!profile) return null;

  const [
    emailRes,
    flagRes,
    booksRes,
    lastSeenRes,
    readingsRes,
    billingRes,
    auditRes,
  ] = await Promise.all([
    admin.from("users" as never).select("id, email").eq("id", id).maybeSingle(),
    admin.from("user_flags").select("beta_enabled").eq("user_id", id).maybeSingle(),
    admin
      .from("books")
      .select("id, title, status, created_at")
      .eq("author_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("analytics_events")
      .select("created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("readings")
      .select("book_id, progress_percent, last_read_at, current_chapter")
      .eq("user_id", id)
      .order("last_read_at", { ascending: false })
      .limit(8),
    admin
      .from("billing_accounts")
      .select("plan, status, current_period_end, cancel_at_period_end")
      .eq("user_id", id)
      // billing_accounts PK is (user_id, role); a dual-role user has >1 row.
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("audit_log")
      .select("id, action, actor_role, meta, created_at")
      .eq("entity_type", "user")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const allBooks = (booksRes.data ?? []) as Array<{
    id: string;
    title: string;
    status: BookStatus;
    created_at: string;
  }>;
  const breakdown: Record<BookStatus, number> = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
  for (const b of allBooks) {
    if (b.status in breakdown) breakdown[b.status] += 1;
  }

  const readings = (readingsRes.data ?? []) as Array<{
    book_id: string;
    progress_percent: number;
    last_read_at: string;
    current_chapter: number;
  }>;
  const readingIds = [...new Set(readings.map((r) => r.book_id))];
  const titleMap = new Map<string, string>();
  if (readingIds.length > 0) {
    const { data: readBooks } = await admin
      .from("books")
      .select("id, title")
      .in("id", readingIds);
    for (const b of (readBooks ?? []) as Array<{ id: string; title: string }>) {
      titleMap.set(b.id, b.title);
    }
  }

  const billing = billingRes.data
    ? (billingRes.data as UserDetail["billing"])
    : null;

  return {
    user_id: profile.user_id as string,
    email: (emailRes.data as { email: string | null } | null)?.email ?? null,
    role: (profile.role as string | null) ?? null,
    display_name: (profile.display_name as string | null) ?? null,
    username: (profile.username as string | null) ?? null,
    avatar_url: await getAvatarUrlFromPathServer(profile.avatar_url as string | null),
    bio: (profile.bio as string | null) ?? null,
    website_url: (profile.website_url as string | null) ?? null,
    is_public: Boolean(profile.is_public),
    social_links: normalizeSocialLinks(
      profile.social_links as Record<string, unknown> | null
    ),
    beta_enabled:
      (flagRes.data as { beta_enabled: boolean } | null)?.beta_enabled ?? false,
    created_at: (profile.created_at as string | null) ?? null,
    updated_at: (profile.updated_at as string | null) ?? null,
    last_seen_at:
      (lastSeenRes.data as { created_at: string } | null)?.created_at ?? null,
    books: { total: allBooks.length, breakdown, list: allBooks.slice(0, 8) },
    inProgress: readings.map((r) => ({
      book_id: r.book_id,
      book_title: titleMap.get(r.book_id) ?? null,
      progress_percent: r.progress_percent,
      current_chapter: r.current_chapter,
      last_read_at: r.last_read_at,
    })),
    billing,
    audit: (auditRes.data ?? []) as UserDetail["audit"],
  };
}

function normalizeSocialLinks(
  raw: Record<string, unknown> | null
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim();
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Formatting helpers
 * ───────────────────────────────────────────────────────────────────────────── */

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const DATETIME_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}
function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATETIME_FMT.format(d);
}

function roleBadge(role: string | null) {
  const normalized = (role ?? "reader").toLowerCase();
  if (normalized === "admin") return <Badge variant="brand">Admin</Badge>;
  if (normalized === "author") return <Badge variant="info">Author</Badge>;
  return <Badge variant="neutral">Reader</Badge>;
}

function bookStatusBadge(status: BookStatus) {
  if (status === "PUBLISHED") return <Badge variant="success">Published</Badge>;
  if (status === "ARCHIVED") return <Badge variant="warning">Archived</Badge>;
  return <Badge variant="neutral">Draft</Badge>;
}

function humanizeAction(action: string): string {
  return action
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────────────────────────────────────── */

export default async function AdminUserDetailPage({ params }: PageProps) {
  await requireAdminRole();

  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const user = await loadUserDetail(id);
  if (!user) notFound();

  const name = user.display_name || user.username || "Unnamed user";

  return (
    <div className="page-content py-10">
      <Breadcrumbs
        className="mb-6"
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Users", href: "/admin/users" },
          { label: name },
        ]}
      />

      <PageHeader
        eyebrow="User"
        title={
          <span className="flex items-center gap-4">
            <Avatar src={user.avatar_url} name={name} />
            <span>{name}</span>
          </span>
        }
        description={user.email ?? "No email on record."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {roleBadge(user.role)}
            {user.beta_enabled ? (
              <Badge variant="success">Beta enabled</Badge>
            ) : (
              <Badge variant="neutral">No beta</Badge>
            )}
            <Badge variant={user.is_public ? "info" : "neutral"}>
              {user.is_public ? "Public profile" : "Private profile"}
            </Badge>
          </div>
        }
      />

      <div className="section-gap mt-8">
        {/* Identity / meta */}
        <Card>
          <CardHeader>
            <h2 className="text-section-title flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-400" aria-hidden />
              Identity
            </h2>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Field label="User ID" mono>
              {user.user_id}
            </Field>
            <Field label="Username">{user.username ? `@${user.username}` : "—"}</Field>
            <Field label="Joined">{fmtDate(user.created_at)}</Field>
            <Field label="Last updated">{fmtDate(user.updated_at)}</Field>
            <Field label="Bio" full>
              {user.bio ? (
                <span className="text-body whitespace-pre-line">{user.bio}</span>
              ) : (
                "—"
              )}
            </Field>
            {(user.website_url || Object.keys(user.social_links).length > 0) && (
              <Field label="Links" full>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {user.website_url && (
                    <ExternalLink href={user.website_url}>
                      <Globe className="h-3.5 w-3.5" aria-hidden />
                      Website
                    </ExternalLink>
                  )}
                  {Object.entries(user.social_links).map(([platform, url]) => (
                    <ExternalLink key={platform} href={url}>
                      {platform}
                    </ExternalLink>
                  ))}
                </span>
              </Field>
            )}
          </CardContent>
        </Card>

        {/* Authored books */}
        <Card>
          <CardHeader className="flex items-center justify-between gap-4">
            <h2 className="text-section-title flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-400" aria-hidden />
              Authored books
            </h2>
            <span className="text-caption tabular-nums">
              {user.books.total} total · {user.books.breakdown.PUBLISHED} published ·{" "}
              {user.books.breakdown.DRAFT} draft · {user.books.breakdown.ARCHIVED}{" "}
              archived
            </span>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {user.books.list.length === 0 ? (
              <div className="px-6 py-6">
                <EmptyState
                  title="No authored books"
                  description="This user has not created any books."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.books.list.map((book) => (
                    <TableRow key={book.id}>
                      <TableCell className="font-medium text-slate-900 dark:text-white">
                        <Link
                          href={`/admin/books/${book.id}`}
                          className="rounded-md transition-colors hover:text-[var(--brand-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
                        >
                          {book.title || "Untitled"}
                        </Link>
                      </TableCell>
                      <TableCell>{bookStatusBadge(book.status)}</TableCell>
                      <TableCell className="text-caption tabular-nums">
                        {fmtDate(book.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Activity */}
        <Card>
          <CardHeader className="flex items-center justify-between gap-4">
            <h2 className="text-section-title flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" aria-hidden />
              Activity
            </h2>
            <span className="text-caption">
              Last seen {fmtDateTime(user.last_seen_at)}
            </span>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {user.inProgress.length === 0 ? (
              <div className="px-6 py-6">
                <EmptyState
                  title="No reading activity"
                  description="No books in progress for this user."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Chapter</TableHead>
                    <TableHead>Last read</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.inProgress.map((r) => (
                    <TableRow key={r.book_id}>
                      <TableCell className="font-medium text-slate-900 dark:text-white">
                        <Link
                          href={`/admin/books/${r.book_id}`}
                          className="rounded-md transition-colors hover:text-[var(--brand-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
                        >
                          {r.book_title ?? "Unknown book"}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {Math.round(r.progress_percent)}%
                      </TableCell>
                      <TableCell className="tabular-nums">{r.current_chapter}</TableCell>
                      <TableCell className="text-caption tabular-nums">
                        {fmtDateTime(r.last_read_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Billing — only when present */}
        {user.billing && (
          <Card>
            <CardHeader>
              <h2 className="text-section-title flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-slate-400" aria-hidden />
                Billing
              </h2>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Field label="Plan">{user.billing.plan ?? "—"}</Field>
              <Field label="Status">{user.billing.status ?? "—"}</Field>
              <Field label="Renews">{fmtDate(user.billing.current_period_end)}</Field>
              <Field label="Cancels at period end">
                {user.billing.cancel_at_period_end ? (
                  <Badge variant="warning">Yes</Badge>
                ) : (
                  <Badge variant="neutral">No</Badge>
                )}
              </Field>
            </CardContent>
          </Card>
        )}

        {/* Audit trail */}
        <Card>
          <CardHeader>
            <h2 className="text-section-title flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-slate-400" aria-hidden />
              Audit trail
            </h2>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {user.audit.length === 0 ? (
              <div className="px-6 py-6">
                <EmptyState
                  title="No audit entries"
                  description="No recorded admin actions for this user."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor role</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.audit.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium text-slate-900 dark:text-white">
                        {humanizeAction(entry.action)}
                      </TableCell>
                      <TableCell className="text-caption uppercase tracking-[0.1em]">
                        {entry.actor_role ?? "—"}
                      </TableCell>
                      <TableCell className="text-caption tabular-nums">
                        {fmtDateTime(entry.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Presentational pieces
 * ───────────────────────────────────────────────────────────────────────────── */

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    // Avatar is a signed/public Supabase Storage URL on an arbitrary remote
    // host; next/image remote patterns aren't configured for it here.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={56}
        height={56}
        className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-white/10"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[20px] font-semibold text-slate-500 dark:bg-white/10 dark:text-white/60"
    >
      {initial}
    </span>
  );
}

function Field({
  label,
  children,
  mono,
  full,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <div className="text-eyebrow mb-1.5">{label}</div>
      <div
        className={
          mono
            ? "break-all font-mono text-[13px] text-slate-700 dark:text-white/70"
            : "text-[14px] text-slate-700 dark:text-white/80"
        }
      >
        {children}
      </div>
    </div>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md text-[14px] text-[var(--brand-violet)] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
    >
      {children}
    </a>
  );
}
