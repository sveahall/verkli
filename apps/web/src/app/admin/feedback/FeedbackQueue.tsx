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

export type FeedbackRow = {
  id: string;
  user_id: string | null;
  auth_email: string | null;
  type: string;
  message: string;
  url: string | null;
  request_id: string | null;
  status: string;
  created_at: string;
};

const STATUS_FILTERS = ["all", "new", "triaged", "done"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

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

export type FeedbackStatus = Exclude<StatusFilter, "all">;
export type FeedbackPage = { feedback: FeedbackRow[]; total: number; page: number; pageSize: number };
export type QueueApi = {
  load: (page: number, status: StatusFilter, signal: AbortSignal) => Promise<FeedbackPage>;
  save: (id: string, status: FeedbackStatus, expectedStatus: string) => Promise<{ id: string; status: string }>;
};

async function responseJson(response: Response) {
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session expired. Sign in again, then reload the queue.");
    if (response.status === 403) throw new Error("Access denied. Administrator access is required.");
    if (response.status === 409) throw new Error("This item was changed by another administrator. Reload the queue before saving again.");
    if (response.status === 404) throw new Error("This item no longer exists. Reload the queue.");
    if (response.status === 429) throw new Error("Too many changes. Wait a minute, then reload the queue before trying again.");
    throw new Error("The support service is unavailable. Please try again.");
  }
  return response.json();
}

const api: QueueApi = {
  async load(page, status, signal) {
    return responseJson(await fetch(`/api/admin/feedback?page=${page}&status=${status}`, { cache: "no-store", signal }));
  },
  async save(id, status, expectedStatus) {
    const json = await responseJson(await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, expectedStatus }),
    }));
    return json.feedback;
  },
};

function StatusControl({ row, disabled, saving, onSave }: {
  row: FeedbackRow;
  disabled: boolean;
  saving: boolean;
  onSave: (row: FeedbackRow, status: FeedbackStatus) => void;
}) {
  const [draft, setDraft] = useState(row.status);
  const knownStatus = STATUS_FILTERS.includes(row.status as StatusFilter) && row.status !== "all";
  return (
    <div className="space-y-3">
      <Badge variant={statusVariant(row.status)}>{titleCase(row.status)}</Badge>
      <div className="flex items-center gap-2">
        <select aria-label="New status" className="h-11 min-w-[110px] rounded-xl border border-border bg-card px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
          value={draft} disabled={disabled || !knownStatus} onChange={(event) => setDraft(event.target.value)}>
          {!knownStatus && <option value={row.status}>{titleCase(row.status)}</option>}
          {STATUS_FILTERS.filter((value) => value !== "all").map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
        </select>
        <Button size="sm" variant="secondary" disabled={disabled || draft === row.status || !knownStatus}
          isLoading={saving} loadingText="Saving…" onClick={() => onSave(row, draft as FeedbackStatus)}>Save</Button>
      </div>
    </div>
  );
}

export default function FeedbackQueue({ queueApi = api }: { queueApi?: QueueApi }) {
  const [snapshot, setSnapshot] = useState<(FeedbackPage & { status: StatusFilter }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void queueApi.load(page, status, controller.signal).then((data) => {
      if (!active) return;
      const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setSnapshot({ ...data, status });
      setSaveError("");
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Could not load feedback.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, status, reload, queueApi]);

  const refresh = () => setReload((value) => value + 1);
  const stale = loading || !!error || snapshot?.page !== page || snapshot?.status !== status;
  const save = async (row: FeedbackRow, nextStatus: FeedbackStatus) => {
    if (savingId || stale || saveError) return;
    setSavingId(row.id);
    setSaved("");
    try {
      const updated = await queueApi.save(row.id, nextStatus, row.status);
      setSnapshot((current) => current ? {
        ...current,
        feedback: current.feedback.map((item) => item.id === updated.id ? { ...item, status: updated.status } : item),
      } : current);
      setSaved("Status saved. Status changes do not send a reply.");
      refresh();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not save this status. Reload the queue before trying again.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="page-content min-w-0 py-10">
      <Breadcrumbs className="mb-4" items={[{ label: "Admin", href: "/admin" }, { label: "Feedback" }]} />
      <PageHeader eyebrow="Support" title="Feedback" description="Support and in-app feedback, newest first. Review each item, reply through your support mailbox, and save its status here." />
      <div className="mt-8 min-w-0 space-y-6">
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label htmlFor="feedback-status" className="text-label">Status</label>
              <select id="feedback-status" value={status} disabled={!!savingId}
                onChange={(event) => { setStatus(event.target.value as StatusFilter); setPage(1); setSaved(""); }}
                className="h-11 rounded-xl border border-border bg-card px-3.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30">
                {STATUS_FILTERS.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
              </select>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={refresh} disabled={!!savingId} isLoading={loading} loadingText="Refreshing…">Refresh</Button>
          </div>
          <p className="text-caption mt-3">New: awaiting review. Triaged: reviewed and awaiting action. Done: resolved. Saving a status does not send email.</p>
        </Card>
        {error && <div role="alert"><ErrorState title="Could not load feedback" description={`${error}${snapshot ? ` Showing the last loaded page (${STATUS_LABELS[snapshot.status]}, page ${snapshot.page}); it may be out of date.` : ""}`}
          action={<Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>Try again</Button>} /></div>}
        {saveError && <div role="alert"><ErrorState title="Status was not confirmed" description={saveError}
          action={<Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>Reload queue</Button>} /></div>}
        {saved && <p role="status" className="text-caption">{saved}</p>}
        {loading && snapshot && <p role="status" className="text-caption">Refreshing… Showing the last loaded page ({STATUS_LABELS[snapshot.status]}, page {snapshot.page}).</p>}
        {!snapshot ? (!error && <Card><CardContent className="space-y-1 px-0 py-0">{Array.from({ length: 6 }).map((_, index) => <TableRowSkeleton key={index} columns={5} />)}</CardContent></Card>)
          : snapshot.total === 0 ? <EmptyState icon={<MessageSquare className="h-5 w-5" aria-hidden />} title="No feedback yet"
            description={snapshot.status === "all" ? "Nothing has been submitted through the support or feedback forms." : `No feedback with status “${STATUS_LABELS[snapshot.status]}”.`} />
          : <>
            <p className="text-caption tabular-nums">{snapshot.total} item{snapshot.total !== 1 ? "s" : ""}</p>
            <Card className="min-w-0 overflow-hidden p-0" aria-busy={loading}>
              <Table className="min-w-[1000px] table-fixed">
                <TableHeader><TableRow>
                  <TableHead className="w-[140px]">Received / type</TableHead>
                  <TableHead className="w-[230px]">Status</TableHead>
                  <TableHead className="w-[350px]">Message</TableHead>
                  <TableHead className="w-[280px]">Reply identity / context</TableHead>
                </TableRow></TableHeader>
                <TableBody>{snapshot.feedback.map((row) => <TableRow key={row.id}>
                  <TableCell className="align-top"><p className="text-caption tabular-nums mb-3">{fmtDate(row.created_at)}</p><Badge variant={typeVariant(row.type)}>{titleCase(row.type)}</Badge></TableCell>
                  <TableCell className="align-top"><StatusControl key={`${row.id}:${row.status}:${reload}`} row={row} disabled={stale || !!savingId || !!saveError} saving={savingId === row.id} onSave={(item, nextStatus) => void save(item, nextStatus)} /></TableCell>
                  <TableCell className="align-top whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{row.message}</TableCell>
                  <TableCell className="text-caption align-top break-words [overflow-wrap:anywhere]">
                    <p>{row.user_id ? row.auth_email || "Account email unavailable" : "Anonymous — reply address may be in the message"}</p>
                    {row.user_id && <p className="mt-2">Account: {row.user_id}</p>}
                    {row.url && <p className="mt-2">{row.url}</p>}
                    {row.request_id && <p className="mt-2">Request: {row.request_id}</p>}
                  </TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </Card>
          </>}
        {snapshot && snapshot.total > 0 && <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1 || !!savingId} onClick={() => setPage((value) => value - 1)}>Previous</Button>
          <span className="text-caption tabular-nums">Page {snapshot.page} of {Math.max(1, Math.ceil(snapshot.total / snapshot.pageSize))}</span>
          <Button variant="secondary" size="sm" disabled={stale || !!savingId || page * snapshot.pageSize >= snapshot.total} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>}
      </div>
    </div>
  );
}
