"use client";

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
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
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, TableRowSkeleton } from "@/components/ui/states";

/**
 * Admin read view over the `feedback` table.
 *
 * `GET /api/admin/feedback` has existed with zero UI consumers, so everything
 * readers and authors submitted landed in a table nobody could read. This is
 * that reader. Auth is handled once in `admin/layout.tsx` via
 * `requireAdminPageAccess()` — deliberately no gating here.
 *
 * The route returns every row with no pagination and no total, so the page
 * filters and pages client-side over what it already has.
 */

type FeedbackRow = {
  id: string;
  user_id: string | null;
  type: string;
  message: string;
  url: string | null;
  request_id: string | null;
  status: string;
  created_at: string;
};

const PAGE_SIZE = 50;

const STATUS_FILTERS = ["all", "new", "triaged", "done"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All statuses",
  new: "New",
  triaged: "Triaged",
  done: "Done",
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : DATE_FMT.format(parsed);
}

function statusVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "new":
      return "warning";
    case "triaged":
      return "info";
    case "done":
      return "success";
    default:
      return "neutral";
  }
}

function typeVariant(type: string): BadgeProps["variant"] {
  switch (type) {
    case "bug":
      return "error";
    case "idea":
      return "brand";
    default:
      return "neutral";
  }
}

function titleCase(value: string): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function AdminFeedbackPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feedback", { cache: "no-store" });
      if (!res.ok) {
        setError(
          res.status === 403 ? "Access denied." : "Could not load feedback."
        );
        return;
      }
      const json = await res.json();
      setRows(json.feedback ?? []);
      setLoaded(true);
    } catch {
      setError("Could not load feedback.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load only; refreshing afterwards is a user-driven action.
    void load();
  }, []);

  const filtered =
    status === "all" ? rows : rows.filter((row) => row.status === status);
  const total = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const newCount = rows.filter((row) => row.status === "new").length;

  const changeStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  };

  return (
    <div className="page-content py-10">
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Admin", href: "/admin" }, { label: "Feedback" }]}
      />
      <PageHeader
        eyebrow="Support"
        title="Feedback"
        description="Everything submitted from the support form and the in-app feedback forms, newest first."
      />

      <div className="mt-8 space-y-6">
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label htmlFor="feedback-status" className="text-label">
                Status
              </label>
              <select
                id="feedback-status"
                value={status}
                onChange={(event) =>
                  changeStatus(event.target.value as StatusFilter)
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white dark:focus:border-white/25 dark:focus:ring-white/15"
              >
                {STATUS_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              isLoading={loading}
              loadingText="Refreshing…"
            >
              Refresh
            </Button>
          </div>
        </Card>

        {error ? (
          <ErrorState
            title="Could not load feedback"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        ) : !loaded ? (
          <Card>
            <CardContent className="space-y-1 px-0 py-0">
              {Array.from({ length: 6 }).map((_, index) => (
                <TableRowSkeleton key={index} columns={5} />
              ))}
            </CardContent>
          </Card>
        ) : total === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" aria-hidden />}
            title="No feedback yet"
            description={
              status === "all"
                ? "Nothing has been submitted through the support or feedback forms."
                : `No feedback with status “${STATUS_LABELS[status]}”.`
            }
          />
        ) : (
          <>
            <p className="text-caption tabular-nums">
              {total} item{total !== 1 ? "s" : ""}
              {status === "all" && newCount > 0
                ? ` · ${newCount} awaiting triage`
                : ""}
            </p>
            <Card className="overflow-hidden p-0">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Context</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-caption whitespace-nowrap tabular-nums">
                        {fmtDate(row.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={typeVariant(row.type)}>
                          {titleCase(row.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>
                          {titleCase(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[420px] whitespace-pre-wrap break-words">
                        {row.message}
                      </TableCell>
                      <TableCell className="text-caption break-words">
                        {row.user_id ? "Signed in" : "Anonymous"}
                        {row.url ? (
                          <>
                            <br />
                            {row.url}
                          </>
                        ) : null}
                        {row.request_id ? (
                          <>
                            <br />
                            {row.request_id}
                          </>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {total > PAGE_SIZE && (
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-caption tabular-nums">Page {page}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page * PAGE_SIZE >= total}
                  onClick={() => setPage(page + 1)}
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
