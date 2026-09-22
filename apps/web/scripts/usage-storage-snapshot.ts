/**
 * Snapshot how many bytes each user stores.
 *
 *   npm run usage:storage
 *
 * Writes one `storage_snapshot` row per user per bucket. Intended to run
 * nightly; each run is a point-in-time reading, not a delta.
 *
 * Listing is recursive because Supabase's `list` returns a single level: an
 * entry with no metadata is a folder, and an unrecursed listing would report
 * every bucket as empty.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { recordUsage } from "../src/lib/usage/meter";
import {
  BUCKET_OWNER_KIND,
  summarizeFiles,
  type StoredFile,
} from "../src/lib/usage/storage-usage";

function loadEnv(): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const file = path.resolve(scriptDir, "..", name);
    if (existsSync(file)) config({ path: file, override: false });
  }
}

const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = ReturnType<typeof createAdminClient>;

async function listRecursive(admin: Admin, bucket: string, prefix = ""): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Supabase marks folders by returning them without metadata. `id` is
      // null for them too, which is the more reliable of the two signals.
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

async function main() {
  loadEnv();
  const admin = createAdminClient();

  // Book-keyed buckets resolve through the book's author. Loaded once rather
  // than per file: four buckets share this map.
  const { data: books, error: booksError } = await admin.from("books").select("id, author_id");
  if (booksError) throw new Error(`books read failed: ${booksError.message}`);
  const authorOfBook = new Map((books ?? []).map((b) => [b.id, b.author_id]));

  // Storage outlives its owner: deleting an account leaves the files behind,
  // and `usage_events.user_id` has a FK to auth.users. Without this check the
  // insert fails, the meter swallows the error by contract, and bytes that are
  // still being paid for disappear from the report without a word. Counted and
  // printed as orphaned instead.
  const { data: profiles, error: profilesError } = await admin.from("profiles").select("user_id");
  if (profilesError) throw new Error(`profiles read failed: ${profilesError.message}`);
  const liveUsers = new Set((profiles ?? []).map((p) => p.user_id));

  let grandTotal = 0;
  let grandOrphaned = 0;

  for (const [bucket, ownerKind] of Object.entries(BUCKET_OWNER_KIND)) {
    let files: StoredFile[];
    try {
      files = await listRecursive(admin, bucket);
    } catch (err) {
      console.error(`[usage:storage] ${bucket}: listing failed`, err);
      continue;
    }

    const ownerOf = (filePath: string): string | null => {
      if (ownerKind === "none") return null;
      const head = filePath.split("/")[0];
      if (!UUID.test(head)) return null;
      return ownerKind === "user" ? head : (authorOfBook.get(head) ?? null);
    };

    const summary = summarizeFiles(files, ownerOf);
    grandTotal += summary.totalBytes;

    // A snapshot is a reading, not an increment, so today's readings for this
    // bucket are replaced rather than added to. Without this a second run in
    // the same day doubles every user's apparent storage, and the admin view
    // would have to know to take the latest row instead of the sum — pushing
    // the subtlety into every future query instead of settling it here.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { error: clearError } = await admin
      .from("usage_events")
      .delete()
      .eq("kind", "storage_snapshot")
      .eq("meta->>bucket", bucket)
      .gte("occurred_at", startOfDay.toISOString());
    if (clearError) {
      console.error(`[usage:storage] ${bucket}: could not clear today's snapshot`, clearError.message);
    }

    let orphanedBytes = 0;
    for (const [userId, bytes] of summary.byOwner) {
      if (!liveUsers.has(userId)) {
        orphanedBytes += bytes;
        continue;
      }
      await recordUsage({ userId, pipeline: "other" }, [
        {
          kind: "storage_snapshot",
          provider: "supabase",
          quantity: bytes,
          unit: "bytes",
          meta: { bucket },
        },
      ]);
    }
    grandOrphaned += orphanedBytes;

    console.info(
      `[usage:storage] ${bucket.padEnd(16)} ${files.length} files, ` +
        `${summary.byOwner.size} users, ${(summary.totalBytes / 1e6).toFixed(1)} MB` +
        (summary.unattributedBytes
          ? `, ${(summary.unattributedBytes / 1e6).toFixed(1)} MB unattributed`
          : "") +
        (orphanedBytes ? `, ${(orphanedBytes / 1e6).toFixed(1)} MB orphaned` : "") +
        (summary.unknownSizeCount ? `, ${summary.unknownSizeCount} without a size` : "")
    );
  }

  console.info(
    `[usage:storage] total ${(grandTotal / 1e6).toFixed(1)} MB` +
      (grandOrphaned
        ? `, of which ${(grandOrphaned / 1e6).toFixed(1)} MB belongs to deleted accounts`
        : "")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
