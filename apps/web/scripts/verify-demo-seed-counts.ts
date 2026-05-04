/**
 * Verify investor-demo row counts.
 *
 * Prints a single JSON line with the live row counts for every table the
 * seed touches. Used to confirm idempotency: run the seed twice and diff the
 * verifier output. Anything that grows row-by-row across runs is a bug.
 *
 * Usage:
 *   npx tsx apps/web/scripts/verify-demo-seed-counts.ts
 *
 * Honors DEMO_SEED_ALLOW_NONLOCAL semantics indirectly via the same admin
 * client; safe to run against any environment that the seed itself runs in.
 */

import "./load-dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import {
  DEMO_AUTHOR_USERNAME,
  DEMO_BOOK_SLUG,
} from "./seed-data/haunted-diary";

interface Counts {
  profiles_demo: number;
  books_demo: number;
  book_versions: number;
  chapters: number;
  book_translations: number;
  audiobook_assets: number;
  marketing_campaigns: number;
  /** Distinct demo_run_id values across all demo rows; useful sanity check. */
  distinct_run_ids: number;
}

async function main(): Promise<void> {
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", DEMO_AUTHOR_USERNAME)
    .maybeSingle();
  const authorId = profile?.user_id ?? null;

  const { data: book } = authorId
    ? await supabase
        .from("books")
        .select("id, demo_run_id")
        .eq("author_id", authorId)
        .eq("slug", DEMO_BOOK_SLUG)
        .maybeSingle()
    : { data: null as { id: string; demo_run_id: string | null } | null };
  const bookId = book?.id ?? null;

  const exact = { count: "exact" as const, head: true };

  const profilesDemo = await supabase
    .from("profiles")
    .select("user_id", exact)
    .eq("username", DEMO_AUTHOR_USERNAME);
  const booksDemo = authorId
    ? await supabase
        .from("books")
        .select("id", exact)
        .eq("author_id", authorId)
        .eq("slug", DEMO_BOOK_SLUG)
    : { count: 0 as number | null };
  const versions = bookId
    ? await supabase.from("book_versions").select("id", exact).eq("book_id", bookId)
    : { count: 0 as number | null };
  const chapters = bookId
    ? await supabase.from("chapters").select("id", exact).eq("book_id", bookId)
    : { count: 0 as number | null };
  const translations = bookId
    ? await supabase.from("book_translations").select("id", exact).eq("book_id", bookId)
    : { count: 0 as number | null };
  const audio = bookId
    ? await supabase.from("audiobook_assets").select("id", exact).eq("book_id", bookId)
    : { count: 0 as number | null };
  const campaigns = bookId
    ? await supabase.from("marketing_campaigns").select("id", exact).eq("book_id", bookId)
    : { count: 0 as number | null };

  // Pull demo_run_ids from one row of each table to see if they all match.
  const runIds = new Set<string>();
  if (book?.demo_run_id) runIds.add(book.demo_run_id);
  if (bookId) {
    const tables: ReadonlyArray<string> = [
      "book_versions",
      "book_translations",
      "audiobook_assets",
      "marketing_campaigns",
    ];
    for (const t of tables) {
      const { data } = await supabase
        .from(t)
        .select("demo_run_id")
        .eq("book_id", bookId)
        .not("demo_run_id", "is", null)
        .limit(50);
      for (const r of (data ?? []) as Array<{ demo_run_id: string | null }>) {
        if (r.demo_run_id) runIds.add(r.demo_run_id);
      }
    }
  }

  const counts: Counts = {
    profiles_demo: profilesDemo.count ?? 0,
    books_demo: booksDemo.count ?? 0,
    book_versions: versions.count ?? 0,
    chapters: chapters.count ?? 0,
    book_translations: translations.count ?? 0,
    audiobook_assets: audio.count ?? 0,
    marketing_campaigns: campaigns.count ?? 0,
    distinct_run_ids: runIds.size,
  };

  // Single JSON line: easy to diff with jq / shell.
  console.log(JSON.stringify(counts));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[verify] Failed:", message);
  process.exit(1);
});
