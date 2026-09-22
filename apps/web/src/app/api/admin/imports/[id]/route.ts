import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { loadImportQueueDiagnostic } from "@/lib/queues/import-diagnostics";

const limiter = createPerUserRateLimiter({ name: "admin-import-diagnostics", maxPerMinute: 30 });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const statuses = new Set(["pending", "queued", "processing", "running", "completed", "failed"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRoleForApi();
  if (auth.response || !auth.user) return auth.response ?? json({ error: "Sign in as an administrator." }, 401);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return json({ error: "Enter a valid import reference." }, 400);
  if (!(await limiter.check(auth.user.id)).allowed) return json({ error: "Too many lookups. Wait a minute and try again." }, 429);
  try {
    const { data: row, error } = await createAdminClient().from("book_imports")
      .select("id, status, progress, created_at, updated_at").eq("id", id).maybeSingle();
    if (error) throw new Error("ImportDiagnosticReadFailed");
    if (!row) return json({ error: "No import found for this reference." }, 404);
    return json({ id: row.id, status: statuses.has(row.status) ? row.status : "unknown",
      progress: Number.isFinite(row.progress) ? Math.max(0, Math.min(100, row.progress)) : null,
      createdAt: row.created_at, updatedAt: row.updated_at, queue: await loadImportQueueDiagnostic(id) });
  } catch {
    console.error("[admin import diagnostics] lookup unavailable", { importId: id });
    return json({ error: "Import diagnostics are unavailable. Try again." }, 503);
  }
}
