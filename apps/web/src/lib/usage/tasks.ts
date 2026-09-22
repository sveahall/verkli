/**
 * The three usage maintenance tasks, as importable functions.
 *
 * They live here rather than inside the CLI scripts so the worker scheduler can
 * call the same code the scripts do. A script that runs its work at import time
 * cannot be scheduled from another process without re-running it on import.
 *
 * All three are idempotent, which is what makes them safe to run from more than
 * one worker replica: the storage snapshot replaces the day's readings, the job
 * sync skips ids it has already recorded, and the rollup upserts.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { recordUsage } from "./meter";
import { jobToUsage } from "./job-usage";
import { rollupRows, type RollupInput } from "./rollup";
import { BUCKET_OWNER_KIND, summarizeFiles, type StoredFile } from "./storage-usage";

type Admin = ReturnType<typeof createAdminClient>;

const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETENTION_DAYS = 90;

// ─────────────────────────────────────────────────────────────
// Jobs
// ─────────────────────────────────────────────────────────────

export async function syncJobUsage(): Promise<{ jobs: number; written: number; skipped: number }> {
  const admin = createAdminClient();

  const { data: jobs, error } = await admin
    .from("ai_jobs")
    .select("id, user_id, kind, book_id, started_at, finished_at, status")
    .not("finished_at", "is", null);
  if (error) throw new Error(`ai_jobs read failed: ${error.message}`);

  const { data: seen, error: seenError } = await admin
    .from("usage_events")
    .select("job_id")
    .eq("kind", "job")
    .not("job_id", "is", null);
  if (seenError) throw new Error(`usage_events read failed: ${seenError.message}`);

  const already = new Set((seen ?? []).map((row) => row.job_id));

  let written = 0;
  let skipped = 0;
  for (const job of jobs ?? []) {
    if (already.has(job.id)) { skipped += 1; continue; }
    const usage = jobToUsage(job);
    if (!usage) { skipped += 1; continue; }
    await recordUsage(usage.ctx, usage.events);
    written += 1;
  }

  return { jobs: jobs?.length ?? 0, written, skipped };
}

// ─────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────

async function listRecursive(admin: Admin, bucket: string, prefix = ""): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Supabase marks folders by returning them with a null id. A flat listing
      // reports every bucket as empty.
      if (entry.id === null) {
        out.push(...(await listRecursive(admin, bucket, full)));
      } else {
        const size = (entry.metadata as { size?: number } | null)?.size;
        out.push({ path: full, size: typeof size === "number" ? size : null });
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return out;
}

export type StorageSnapshotResult = {
  totalBytes: number;
  orphanedBytes: number;
  buckets: { bucket: string; files: number; users: number; bytes: number; unattributed: number }[];
};

export async function snapshotStorage(
  log: (line: string) => void = () => {}
): Promise<StorageSnapshotResult> {
  const admin = createAdminClient();

  const { data: books, error: booksError } = await admin.from("books").select("id, author_id");
  if (booksError) throw new Error(`books read failed: ${booksError.message}`);
  const authorOfBook = new Map((books ?? []).map((b) => [b.id, b.author_id]));

  // Storage outlives its owner. Deleted accounts still hold files, and
  // usage_events.user_id has a FK to auth.users, so those inserts fail and the
  // meter eats the error by design — bytes still being paid for would vanish
  // from the report without a word. Counted as orphaned instead.
  const { data: profiles, error: profilesError } = await admin.from("profiles").select("user_id");
  if (profilesError) throw new Error(`profiles read failed: ${profilesError.message}`);
  const liveUsers = new Set((profiles ?? []).map((p) => p.user_id));

  const result: StorageSnapshotResult = { totalBytes: 0, orphanedBytes: 0, buckets: [] };

  for (const [bucket, ownerKind] of Object.entries(BUCKET_OWNER_KIND)) {
    let files: StoredFile[];
    try {
      files = await listRecursive(admin, bucket);
    } catch (err) {
      log(`[usage:storage] ${bucket}: listing failed — ${String(err)}`);
      continue;
    }

    const ownerOf = (filePath: string): string | null => {
      if (ownerKind === "none") return null;
      const head = filePath.split("/")[0];
      if (!UUID.test(head)) return null;
      return ownerKind === "user" ? head : (authorOfBook.get(head) ?? null);
    };

    const summary = summarizeFiles(files, ownerOf);
    result.totalBytes += summary.totalBytes;

    // A snapshot is a reading, not an increment: today's readings for this
    // bucket are replaced rather than added to. Without this a second run in
    // one day doubles every user's apparent storage.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { error: clearError } = await admin
      .from("usage_events")
      .delete()
      .eq("kind", "storage_snapshot")
      .eq("meta->>bucket", bucket)
      .gte("occurred_at", startOfDay.toISOString());
    if (clearError) log(`[usage:storage] ${bucket}: could not clear today — ${clearError.message}`);

    let orphaned = 0;
    for (const [userId, bytes] of summary.byOwner) {
      if (!liveUsers.has(userId)) { orphaned += bytes; continue; }
      await recordUsage({ userId, pipeline: "other" }, [
        { kind: "storage_snapshot", provider: "supabase", quantity: bytes, unit: "bytes", meta: { bucket } },
      ]);
    }
    result.orphanedBytes += orphaned;

    result.buckets.push({
      bucket,
      files: files.length,
      users: summary.byOwner.size,
      bytes: summary.totalBytes,
      unattributed: summary.unattributedBytes,
    });
    log(
      `[usage:storage] ${bucket.padEnd(16)} ${files.length} files, ${summary.byOwner.size} users, ` +
        `${(summary.totalBytes / 1e6).toFixed(1)} MB` +
        (summary.unattributedBytes ? `, ${(summary.unattributedBytes / 1e6).toFixed(1)} MB unattributed` : "") +
        (orphaned ? `, ${(orphaned / 1e6).toFixed(1)} MB orphaned` : "")
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Rollup
// ─────────────────────────────────────────────────────────────

export async function rollupUsage(
  options: { prune?: boolean } = {}
): Promise<{ events: number; dailyRows: number; pruned: number }> {
  const prune = options.prune ?? true;
  const admin = createAdminClient();

  // Paged: a silent truncation would roll up part of the history and prune all
  // of it.
  const all: RollupInput[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("usage_events")
      .select("user_id, occurred_at, pipeline, provider, unit, quantity, cost_usd")
      .order("occurred_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`usage_events read failed: ${error.message}`);
    if (!data?.length) break;
    all.push(...(data as RollupInput[]));
    if (data.length < PAGE) break;
  }

  const rolled = rollupRows(all);
  if (rolled.length > 0) {
    const { error } = await admin
      .from("usage_daily")
      .upsert(rolled, { onConflict: "user_id,day,pipeline,provider,unit" });
    if (error) throw new Error(`usage_daily upsert failed: ${error.message}`);
  }

  if (!prune) return { events: all.length, dailyRows: rolled.length, pruned: 0 };

  // Only after the rolled-up rows are confirmed written. Deleting first trades
  // an unanswered question for permanently lost data.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { error: pruneError, count } = await admin
    .from("usage_events")
    .delete({ count: "exact" })
    .lt("occurred_at", cutoff);
  if (pruneError) throw new Error(`prune failed: ${pruneError.message}`);

  return { events: all.length, dailyRows: rolled.length, pruned: count ?? 0 };
}
