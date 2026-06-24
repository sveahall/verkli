"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  EmptyState,
  ErrorState,
  TableRowSkeleton,
} from "@/components/ui/states";
import { useToastHelpers } from "@/components/ui/toast";

type UserRow = {
  user_id: string;
  email: string | null;
  role: string;
  display_name: string | null;
  username: string | null;
  created_at: string;
  beta_enabled: boolean;
};

const PAGE_SIZE = 50;

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function fmtDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

function roleBadge(role: string) {
  const normalized = (role ?? "reader").toLowerCase();
  if (normalized === "admin") return <Badge variant="brand">Admin</Badge>;
  if (normalized === "author") return <Badge variant="info">Author</Badge>;
  return <Badge variant="neutral">Reader</Badge>;
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-semibold text-slate-500 dark:bg-white/10 dark:text-white/60"
    >
      {initial}
    </span>
  );
}

export default function AdminUsersPage() {
  const toast = useToastHelpers();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = async (pageNum = 1, query = search) => {
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum) });
      if (query) params.set("q", query);

      const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });

      if (!res.ok) {
        setError(
          res.status === 403 ? "Access denied." : "Could not load users."
        );
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

  const toggleBeta = async (user: UserRow) => {
    const enable = !user.beta_enabled;
    setBusyId(user.user_id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.user_id, betaEnabled: enable }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: unknown }
          | null;
        const detail =
          body && typeof body.error === "string"
            ? body.error
            : `Update failed (${res.status})`;
        toast.error(`Could not update beta access: ${detail}`);
        return;
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === user.user_id ? { ...u, beta_enabled: enable } : u
        )
      );
      toast.success(
        enable ? "Beta access enabled." : "Beta access disabled."
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Could not update beta access: ${err.message}`
          : "Could not update beta access."
      );
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    void loadUsers(1, "");
    // Initial load only; subsequent loads are user-driven search/pagination actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-content py-10">
      <PageHeader
        eyebrow="Admin"
        title="User management"
        description="Search users, open a profile, and manage beta access."
      />

      <div className="mt-8 space-y-6">
        <Card>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadUsers(1)}
                  placeholder="Search name or username…"
                  aria-label="Search users"
                />
              </div>
              <Button
                type="button"
                onClick={() => void loadUsers(1)}
                isLoading={loading}
                loadingText="Searching…"
              >
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <ErrorState
            title="Could not load users"
            description={error}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadUsers(page)}
              >
                Try again
              </Button>
            }
          />
        ) : !loaded ? (
          <Card>
            <CardContent className="space-y-1 px-0 py-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={5} />
              ))}
            </CardContent>
          </Card>
        ) : users.length === 0 ? (
          <EmptyState
            title="No users found"
            description="Try a different search term."
          />
        ) : (
          <>
            <p className="text-caption tabular-nums">
              {total} user{total !== 1 ? "s" : ""} total
            </p>
            <Card>
              <CardContent className="px-0 py-0">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Beta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const name =
                        u.display_name || u.username || "Unnamed user";
                      return (
                        <TableRow key={u.user_id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar name={name} />
                              <Link
                                href={`/admin/users/${u.user_id}`}
                                className="rounded-md font-medium text-slate-900 transition-colors hover:text-[var(--brand-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:text-white"
                              >
                                {name}
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell>{u.email ?? "—"}</TableCell>
                          <TableCell>{roleBadge(u.role)}</TableCell>
                          <TableCell className="text-caption tabular-nums">
                            {fmtDate(u.created_at)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busyId === u.user_id}
                              onClick={() => void toggleBeta(u)}
                              aria-pressed={u.beta_enabled}
                            >
                              {u.beta_enabled ? "Enabled" : "Disabled"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {total > PAGE_SIZE && (
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => void loadUsers(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-caption tabular-nums">Page {page}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page * PAGE_SIZE >= total || loading}
                  onClick={() => void loadUsers(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
