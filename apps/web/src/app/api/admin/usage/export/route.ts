// Raw usage rows as CSV, because pricing gets decided in a spreadsheet.
//
// Exports events rather than a summary on purpose: the whole point of keeping
// raw units is being able to ask a question nobody thought of in advance.

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRoleForApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "occurred_at",
  "user_id",
  "kind",
  "pipeline",
  "provider",
  "model",
  "quantity",
  "unit",
  "cost_usd",
  "price_version",
  "book_id",
  "job_id",
  "request_id",
] as const;

/**
 * RFC 4180 quoting. Model ids and bucket names are tame, but a CSV that breaks
 * on the first comma is worse than no export at all.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? "90");
  const since = new Date(
    Date.now() - (Number.isFinite(days) && days > 0 ? days : 90) * 86_400_000
  ).toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("usage_events")
    .select(COLUMNS.join(", "))
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(100_000);

  if (error) {
    return new Response(`Could not read usage events: ${error.message}`, { status: 503 });
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [
    COLUMNS.join(","),
    ...rows.map((row) => COLUMNS.map((column) => cell(row[column])).join(",")),
  ].join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="verkli-usage-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
