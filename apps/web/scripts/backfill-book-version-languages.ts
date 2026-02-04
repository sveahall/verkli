/**
 * Backfill script: set book_versions.language_code when missing/unknown.
 *
 * Usage:
 *  - DRY_RUN=true ts-node apps/web/scripts/backfill-book-version-languages.ts
 *  - ts-node apps/web/scripts/backfill-book-version-languages.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local.
 */

import "./load-dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { detectLanguageFromText } from "../src/lib/language-detect";
import { normalizeLanguageOrNull } from "../src/lib/languages";

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if ("content" in node && Array.isArray((node as { content?: unknown[] }).content)) {
    return (node as { content: unknown[] }).content.map(extractText).join("");
  }
  return "";
}

function extractPlainText(content: string | null | undefined): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || trimmed.startsWith("[")) {
    try {
      return extractText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

async function main() {
  const supabase = createAdminClient();
  const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
  console.log("[backfill] starting", dryRun ? "(dry-run)" : "");

  const { data: versions, error: versionsError } = await supabase
    .from("book_versions")
    .select("id, book_id, language_code, created_at")
    .order("created_at", { ascending: true });

  if (versionsError || !versions) {
    throw new Error(versionsError?.message ?? "Failed to load book versions");
  }

  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, original_language, language");

  if (booksError || !books) {
    throw new Error(booksError?.message ?? "Failed to load books");
  }

  const bookById = new Map<string, { original_language: string | null; language: string | null }>();
  for (const book of books) {
    bookById.set(book.id, {
      original_language: book.original_language ?? null,
      language: book.language ?? null,
    });
  }

  let updated = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const version of versions) {
    const normalized = normalizeLanguageOrNull(version.language_code);
    if (normalized) {
      skipped += 1;
      continue;
    }

    const book = bookById.get(version.book_id);
    const bookLanguage =
      normalizeLanguageOrNull(book?.original_language ?? null) ??
      normalizeLanguageOrNull(book?.language ?? null);

    let resolved = bookLanguage;
    let source = "book";

    if (!resolved) {
      const { data: chapter } = await supabase
        .from("chapters")
        .select("content, source_text")
        .eq("book_version_id", version.id)
        .order("order", { ascending: true })
        .limit(1)
        .maybeSingle();
      const sample = extractPlainText((chapter?.source_text as string | null) ?? chapter?.content ?? null);
      const detected = detectLanguageFromText(sample);
      if (detected) {
        resolved = detected;
        source = "heuristic";
      }
    }

    if (!resolved) {
      unresolved += 1;
      console.warn("[backfill] unresolved version:", version.id);
      continue;
    }

    if (dryRun) {
      console.log("[backfill] would set", version.id, "->", resolved, `(${source})`);
      updated += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("book_versions")
      .update({ language_code: resolved })
      .eq("id", version.id);

    if (updateError) {
      console.warn("[backfill] update failed", version.id, updateError.message);
      continue;
    }

    updated += 1;
  }

  console.log("[backfill] done", { updated, skipped, unresolved });
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[backfill] failed", msg);
  process.exit(1);
});
