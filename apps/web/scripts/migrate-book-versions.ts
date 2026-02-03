/**
 * Migration script: merge translated books into book_versions on the original book.
 *
 * Usage:
 *  - DRY_RUN=true ts-node apps/web/scripts/migrate-book-versions.ts
 *  - ts-node apps/web/scripts/migrate-book-versions.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local.
 */

import "./load-dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { normalizeLanguage } from "../src/lib/languages";

type BookRow = {
  id: string;
  author_id: string;
  title: string;
  language: string | null;
  original_book_id: string | null;
  is_translation: boolean | null;
  status: string | null;
  published_at: string | null;
  created_at: string;
};

type TranslationRow = {
  original_book_id: string;
  translated_book_id: string;
};

const DRY_RUN = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");

function parseLanguageSuffix(title: string): { baseTitle: string; language: string | null } {
  const match = title.match(/^(.*)\\s+\\(([a-z]{2})\\)\\s*$/i);
  if (!match) return { baseTitle: title.trim(), language: null };
  return { baseTitle: match[1].trim(), language: match[2].toLowerCase() };
}

async function upsertVersion(params: {
  supabase: ReturnType<typeof createAdminClient>;
  bookId: string;
  language: string;
  publishedAt?: string | null;
}): Promise<string> {
  const { supabase, bookId, language, publishedAt } = params;
  const { data, error } = await supabase
    .from("book_versions")
    .upsert(
      {
        book_id: bookId,
        language_code: language,
        status: publishedAt ? "done" : "draft",
        published_at: publishedAt ?? null,
      },
      { onConflict: "book_id,language_code" }
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to upsert book version");
  }

  return data.id;
}

async function moveShelfBooks(params: {
  supabase: ReturnType<typeof createAdminClient>;
  fromBookId: string;
  toBookId: string;
}) {
  const { supabase, fromBookId, toBookId } = params;
  const { data: rows } = await supabase
    .from("shelf_books")
    .select("id, shelf_id, section_id, sort_index, created_at, updated_at")
    .eq("book_id", fromBookId);

  for (const row of rows ?? []) {
    const { data: existing } = await supabase
      .from("shelf_books")
      .select("id")
      .eq("shelf_id", row.shelf_id)
      .eq("book_id", toBookId)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase.from("shelf_books").insert({
        shelf_id: row.shelf_id,
        book_id: toBookId,
        section_id: row.section_id,
        sort_index: row.sort_index,
      });
      if (insertError) {
        console.warn("[migrate] shelf_books insert failed:", insertError.message);
      }
    }

    await supabase.from("shelf_books").delete().eq("id", row.id);
  }
}

async function moveBookmarks(params: {
  supabase: ReturnType<typeof createAdminClient>;
  fromBookId: string;
  toBookId: string;
}) {
  const { supabase, fromBookId, toBookId } = params;
  const { data: rows } = await supabase
    .from("bookmarks")
    .select("id, user_id")
    .eq("book_id", fromBookId);

  for (const row of rows ?? []) {
    await supabase
      .from("bookmarks")
      .upsert({ user_id: row.user_id, book_id: toBookId })
      .eq("user_id", row.user_id)
      .eq("book_id", toBookId);
    await supabase.from("bookmarks").delete().eq("id", row.id);
  }
}

async function moveReadings(params: {
  supabase: ReturnType<typeof createAdminClient>;
  fromBookId: string;
  toBookId: string;
}) {
  const { supabase, fromBookId, toBookId } = params;
  const { data: rows } = await supabase
    .from("readings")
    .select("id, user_id, chapter_id, progress_percent, updated_at")
    .eq("book_id", fromBookId);

  for (const row of rows ?? []) {
    await supabase
      .from("readings")
      .upsert({
        user_id: row.user_id,
        book_id: toBookId,
        chapter_id: row.chapter_id,
        progress_percent: row.progress_percent,
        updated_at: row.updated_at,
      })
      .eq("user_id", row.user_id)
      .eq("book_id", toBookId);
    await supabase.from("readings").delete().eq("id", row.id);
  }
}

async function moveMarketingCampaigns(params: {
  supabase: ReturnType<typeof createAdminClient>;
  fromBookId: string;
  toBookId: string;
}) {
  const { supabase, fromBookId, toBookId } = params;
  const { data: rows } = await supabase
    .from("marketing_campaigns")
    .select("id, language, channel, status, headline, caption, cta, hashtags, share_url, created_at, updated_at")
    .eq("book_id", fromBookId);

  for (const row of rows ?? []) {
    await supabase.from("marketing_campaigns").upsert(
      {
        book_id: toBookId,
        language: row.language,
        channel: row.channel,
        status: row.status,
        headline: row.headline,
        caption: row.caption,
        cta: row.cta,
        hashtags: row.hashtags,
        share_url: row.share_url,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      { onConflict: "book_id,language,channel" }
    );
    await supabase.from("marketing_campaigns").delete().eq("id", row.id);
  }
}

async function mergeTranslationBook(params: {
  supabase: ReturnType<typeof createAdminClient>;
  original: BookRow;
  translation: BookRow;
  languageHint?: string | null;
}) {
  const { supabase, original, translation, languageHint } = params;
  if (original.id === translation.id) return;

  const language = normalizeLanguage(
    languageHint ?? translation.language ?? parseLanguageSuffix(translation.title).language ?? "en"
  );

  if (DRY_RUN) {
    console.log(`[dry-run] merge ${translation.id} -> ${original.id} (${language})`);
    return;
  }

  const versionId = await upsertVersion({
    supabase,
    bookId: original.id,
    language,
    publishedAt: translation.published_at ?? null,
  });

  await supabase
    .from("chapters")
    .update({ book_id: original.id, book_version_id: versionId })
    .eq("book_id", translation.id);

  await supabase
    .from("book_imports")
    .update({ book_id: original.id, book_version_id: versionId })
    .eq("book_id", translation.id);

  await supabase.from("audiobook_assets").update({ book_id: original.id }).eq("book_id", translation.id);

  await moveMarketingCampaigns({ supabase, fromBookId: translation.id, toBookId: original.id });
  await moveBookmarks({ supabase, fromBookId: translation.id, toBookId: original.id });
  await moveReadings({ supabase, fromBookId: translation.id, toBookId: original.id });
  await moveShelfBooks({ supabase, fromBookId: translation.id, toBookId: original.id });

  await supabase.from("books").delete().eq("id", translation.id);
}

async function main() {
  const supabase = createAdminClient();
  console.log("[migrate] starting", DRY_RUN ? "(dry-run)" : "");

  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, author_id, title, language, original_book_id, is_translation, status, published_at, created_at")
    .order("created_at", { ascending: true });

  if (booksError || !books) {
    throw new Error(booksError?.message ?? "Failed to load books");
  }

  const bookById = new Map<string, BookRow>();
  books.forEach((b) => bookById.set(b.id, b));

  const merged = new Set<string>();

  // Explicit relationships via original_book_id
  for (const book of books) {
    if (!book.original_book_id) continue;
    const original = bookById.get(book.original_book_id);
    if (!original) continue;
    await mergeTranslationBook({ supabase, original, translation: book });
    merged.add(book.id);
  }

  // Explicit relationships via translations table
  const { data: translationRows } = await supabase
    .from("translations")
    .select("original_book_id, translated_book_id");
  for (const row of (translationRows ?? []) as TranslationRow[]) {
    const original = bookById.get(row.original_book_id);
    const translation = bookById.get(row.translated_book_id);
    if (!original || !translation || merged.has(translation.id)) continue;
    await mergeTranslationBook({ supabase, original, translation });
    merged.add(translation.id);
  }

  // Heuristic groups by owner + title suffix
  const groups = new Map<string, BookRow[]>();
  for (const book of books) {
    if (merged.has(book.id)) continue;
    const { baseTitle } = parseLanguageSuffix(book.title);
    const key = `${book.author_id}:${baseTitle.toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(book);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const baseTitle = parseLanguageSuffix(list[0].title).baseTitle;
    const original =
      list.find((b) => b.title.trim() === baseTitle.trim()) ?? list[0];
    for (const candidate of list) {
      if (candidate.id === original.id || merged.has(candidate.id)) continue;
      const { language } = parseLanguageSuffix(candidate.title);
      await mergeTranslationBook({ supabase, original, translation: candidate, languageHint: language });
      merged.add(candidate.id);
    }
  }

  console.log("[migrate] done");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
