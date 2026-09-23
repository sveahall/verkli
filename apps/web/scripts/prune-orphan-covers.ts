/**
 * Delete cover files in the `book_covers` bucket that nothing references.
 *
 * Why this exists: the bucket holds 344 files for 32 books. Every cover upload
 * and every AI regeneration writes a new object, and nothing ever removed the
 * previous one. 162 MB, of which the largest single file is 27 MB.
 *
 * Storage is not the pressing cost — egress is (7.4 GB against a 5 GB quota).
 * But an unreferenced 27 MB PNG is still a file Next may be asked to fetch and
 * optimise, and the bucket is public.
 *
 * SAFETY. Dry run is the default; `--apply` is the only thing that deletes.
 * A file is a candidate only when its storage path appears in NONE of the
 * columns below. Anything this script cannot read, it treats as a reference —
 * a failed lookup must never widen the delete set.
 *
 *   books.cover_image        the book's current cover
 *   profiles.cover_image     author profile banner
 *   book_clubs.cover_url
 *   shelves.cover_url
 *   ai_jobs.output           JSON, scanned as a whole. Checked and currently
 *                            empty of cover paths: cover/generate/route.ts:220
 *                            returns {requestId, images} straight to the
 *                            browser and persists nothing, so AI candidates
 *                            under ai-generated/ live only in React state for
 *                            one session. Pick one and it is copied to
 *                            books.cover_image; otherwise the file is
 *                            unreachable the moment the page reloads. Kept in
 *                            the scan anyway, in case that ever changes.
 *
 * Usage, from apps/web:
 *   npx tsx --env-file=.env.local scripts/prune-orphan-covers.ts
 *   npx tsx --env-file=.env.local scripts/prune-orphan-covers.ts --apply
 *   npx tsx --env-file=.env.local scripts/prune-orphan-covers.ts --apply --limit 50
 */

import { writeFile } from "node:fs/promises";

const BUCKET = "book_covers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run from apps/web with --env-file=.env.local");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

type StorageEntry = {
  name: string;
  metadata: { size?: number } | null;
};

async function listFolder(prefix: string): Promise<StorageEntry[]> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      limit: 1000,
      prefix,
      sortBy: { column: "name", order: "asc" },
    }),
  });
  if (!res.ok) throw new Error(`list ${prefix || "/"} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as StorageEntry[];
}

/** Every object path in the bucket, with its size. */
async function listAllFiles(): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  const walk = async (prefix: string, depth: number): Promise<void> => {
    for (const entry of await listFolder(prefix)) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.metadata?.size != null) {
        out.push({ path, size: entry.metadata.size });
      } else if (depth < 5) {
        await walk(path, depth + 1);
      }
    }
  };
  await walk("", 0);
  return out;
}

const REFERENCE_PAGE_SIZE = 1000;

async function selectColumn(table: string, column: string): Promise<string[]> {
  // Paged deliberately. An unpaged `?select=` is silently capped by PostgREST
  // at `db-max-rows` and still returns 200, so the `!res.ok` guard below never
  // fires on a truncated read — it only catches a FAILED read. Rows past the
  // cap would be missing from `haystack`, every cover they reference would be
  // classified as an orphan, and the sweep would delete them. That inverts this
  // file's core rule: the scan is deliberately generous about what counts as
  // referenced because "a false orphan destroys someone's cover", and
  // truncation shrinks the haystack, making the script strictly more
  // aggressive in exactly the guarded direction.
  const out: string[] = [];
  for (let offset = 0; ; offset += REFERENCE_PAGE_SIZE) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=${REFERENCE_PAGE_SIZE}&offset=${offset}`,
      { headers }
    );
    if (!res.ok) {
      // A table we cannot read is a table we cannot clear. Fail loudly rather
      // than quietly treating its rows as absent.
      throw new Error(`read ${table}.${column} -> ${res.status} ${await res.text()}`);
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    out.push(...rows.map((r) => JSON.stringify(r[column] ?? "")));
    // A short page is the only reliable end-of-table signal here: PostgREST
    // returns exactly `limit` rows while more remain.
    if (rows.length < REFERENCE_PAGE_SIZE) break;
  }
  return out;
}

async function main() {
  console.log(`\n${BUCKET} — orphan sweep${apply ? "" : "  (DRY RUN)"}\n`);

  const referenceBlobs: string[] = [];
  for (const [table, column] of [
    ["books", "cover_image"],
    ["profiles", "cover_image"],
    ["book_clubs", "cover_url"],
    ["shelves", "cover_url"],
    ["ai_jobs", "output"],
  ] as const) {
    const values = await selectColumn(table, column);
    referenceBlobs.push(...values);
    console.log(`  read ${table}.${column}: ${values.length} rows`);
  }

  // One haystack. A path is referenced if it appears anywhere at all — this is
  // deliberately generous, because a false "referenced" costs disk and a false
  // "orphan" destroys someone's cover.
  const haystack = referenceBlobs.join("\n");

  const files = await listAllFiles();
  // `demo/` is investor-demo material. Nothing in the database or the seed
  // script points at it by path, so the reference scan cannot vouch for it —
  // and a 3.5 MB file is not worth risking the pitch over. Held out by name.
  const orphans = files.filter(
    (f) => !haystack.includes(f.path) && !f.path.startsWith("demo/")
  );
  const referenced = files.length - orphans.length;

  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const orphanBytes = orphans.reduce((n, f) => n + f.size, 0);

  console.log(`\n  files:      ${files.length}  (${(totalBytes / 1e6).toFixed(1)} MB)`);
  console.log(`  referenced: ${referenced}`);
  console.log(`  orphaned:   ${orphans.length}  (${(orphanBytes / 1e6).toFixed(1)} MB)\n`);

  if (orphans.length === 0) {
    console.log("  Nothing to do.\n");
    return;
  }

  const targets = orphans
    .sort((a, b) => b.size - a.size)
    .slice(0, limit === Infinity ? orphans.length : limit);

  console.log(`  ${apply ? "Deleting" : "Would delete"} ${targets.length}:`);
  for (const f of targets.slice(0, 20)) {
    console.log(`    ${(f.size / 1e6).toFixed(2).padStart(8)} MB  ${f.path}`);
  }
  if (targets.length > 20) console.log(`    … and ${targets.length - 20} more`);

  if (!apply) {
    console.log(`\n  Dry run. Re-run with --apply to delete.\n`);
    return;
  }

  // Write the full target list BEFORE deleting anything. stdout is not an audit
  // trail: the listing above prints at most 20 rows and then "… and N more", so
  // a 333-file sweep left ~313 keys unrecoverable from the terminal. Deletion is
  // one-way, so the manifest has to exist before the first batch goes out — if
  // this write fails, nothing is deleted.
  const manifestPath = `prune-orphan-covers-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(
    manifestPath,
    JSON.stringify(
      { bucket: BUCKET, deletedAt: new Date().toISOString(), count: targets.length, bytes: orphanBytes, targets },
      null,
      2
    )
  );
  console.log(`\n  Manifest written: ${manifestPath}`);

  // Storage takes up to 1000 paths per call.
  let deleted = 0;
  for (let i = 0; i < targets.length; i += 100) {
    const batch = targets.slice(i, i + 100).map((f) => f.path);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) {
      console.error(`\n  batch ${i} failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    deleted += batch.length;
    console.log(`  deleted ${deleted}/${targets.length}`);
  }

  console.log(`\n  Done. Freed ~${(orphanBytes / 1e6).toFixed(1)} MB.\n`);
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
