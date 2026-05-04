/**
 * Investor pitch demo seed (idempotent).
 *
 * Creates / refreshes the demo author + book "The Haunted Diary" with 10
 * pre-baked book_versions (1 SV original + 3 A-quality + 6 B-quality
 * translations). Each row is stamped with a fresh demo_run_id so the
 * UI/façade can reset state between rehearsals without coupling to time.
 *
 * Idempotency contract:
 *   - Demo author resolved by profiles.username = DEMO_AUTHOR_USERNAME.
 *   - Book resolved by (author_id, slug=DEMO_BOOK_SLUG).
 *   - Versions resolved by UNIQUE (book_id, language_code).
 *   - Chapters resolved by (book_version_id, order=0) with manual upsert.
 *   - Translation tracking rows resolved by UNIQUE (book_id, language).
 *   - Running this script twice yields the same row count.
 *
 * Safety contract:
 *   - Refuses if SUPABASE_URL is missing.
 *   - Refuses if SUPABASE_URL contains "prod" or "production" (case-
 *     insensitive substring match).
 *   - Refuses non-local URLs unless DEMO_SEED_ALLOW_NONLOCAL=true is set.
 *
 * Usage:
 *   npx tsx apps/web/scripts/seed-investor-demo.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + (NEXT_PUBLIC_)SUPABASE_URL in
 * apps/web/.env.local (loaded automatically via load-dotenv).
 */

import "./load-dotenv";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../src/lib/supabase/admin";
import {
  DEMO_AUTHOR_DISPLAY_NAME,
  DEMO_AUTHOR_EMAIL,
  DEMO_AUTHOR_USERNAME,
  DEMO_BOOK_SLUG,
  DEMO_TRANSLATIONS,
  ORIGINAL_LANGUAGE,
  type DemoTranslation,
} from "./seed-data/haunted-diary";

const DEMO_AUTHOR_PASSWORD = "VerkliDemo!2026";

interface SeedResult {
  demoRunId: string;
  authorId: string;
  bookId: string;
  versionsTouched: number;
  chaptersTouched: number;
  translationRowsTouched: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Safety guard — must run before any DB call.
// ─────────────────────────────────────────────────────────────────────────
function assertSafeTarget(): void {
  const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl || rawUrl.trim() === "") {
    throw new Error(
      "[seed-investor-demo] Refusing to run: SUPABASE_URL is not set. " +
        "Set it in apps/web/.env.local pointing at a local or staging project."
    );
  }
  const url = rawUrl.toLowerCase();
  if (url.includes("prod") || url.includes("production")) {
    throw new Error(
      `[seed-investor-demo] Refusing to run: SUPABASE_URL "${rawUrl}" looks like production. ` +
        "Re-run against staging or a local Supabase instance."
    );
  }
  const isLocal =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("0.0.0.0") ||
    url.endsWith(".local") ||
    url.endsWith(".local/");
  if (!isLocal && process.env.DEMO_SEED_ALLOW_NONLOCAL !== "true") {
    throw new Error(
      `[seed-investor-demo] Refusing to run against non-local SUPABASE_URL "${rawUrl}". ` +
        "If this is a staging project (and you are sure), re-run with DEMO_SEED_ALLOW_NONLOCAL=true."
    );
  }
  console.log(`[seed] Target SUPABASE_URL=${rawUrl}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
async function ensureDemoAuthor(supabase: SupabaseClient): Promise<string> {
  const { data: existing, error: lookupErr } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", DEMO_AUTHOR_USERNAME)
    .maybeSingle();
  if (lookupErr) throw new Error(`Lookup demo author failed: ${lookupErr.message}`);

  if (existing?.user_id) {
    // Refresh demo flags every run so a stale profile cannot accidentally
    // shed the protection.
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({
        display_name: DEMO_AUTHOR_DISPLAY_NAME,
        role: "author",
        is_public: true,
        demo_mode: true,
        is_protected: true,
      })
      .eq("user_id", existing.user_id);
    if (updateErr) throw new Error(`Update demo profile failed: ${updateErr.message}`);
    console.log(`[seed] Demo author exists: ${existing.user_id}`);
    return existing.user_id;
  }

  // Create the auth.users row + matching profile.
  const { data: authResult, error: createErr } = await supabase.auth.admin.createUser({
    email: DEMO_AUTHOR_EMAIL,
    password: DEMO_AUTHOR_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "author", full_name: DEMO_AUTHOR_DISPLAY_NAME },
  });
  if (createErr || !authResult.user) {
    throw new Error(`Create demo auth user failed: ${createErr?.message ?? "no user returned"}`);
  }
  const authorId = authResult.user.id;

  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      user_id: authorId,
      display_name: DEMO_AUTHOR_DISPLAY_NAME,
      username: DEMO_AUTHOR_USERNAME,
      bio: "Investor-pitch demo author. Do not edit; auto-managed by seed-investor-demo.",
      role: "author",
      is_public: true,
      demo_mode: true,
      is_protected: true,
      preferences: {},
    },
    { onConflict: "user_id" }
  );
  if (profileErr) throw new Error(`Insert demo profile failed: ${profileErr.message}`);
  console.log(`[seed] Demo author created: ${authorId}`);
  return authorId;
}

async function ensureDemoBook(
  supabase: SupabaseClient,
  authorId: string,
  demoRunId: string
): Promise<string> {
  const { data: existing, error: lookupErr } = await supabase
    .from("books")
    .select("id")
    .eq("author_id", authorId)
    .eq("slug", DEMO_BOOK_SLUG)
    .maybeSingle();
  if (lookupErr) throw new Error(`Lookup demo book failed: ${lookupErr.message}`);

  const sourceTranslation = DEMO_TRANSLATIONS.find(
    (t) => t.language_code === ORIGINAL_LANGUAGE
  );
  if (!sourceTranslation) {
    throw new Error("Source-language demo translation missing — check haunted-diary.ts");
  }

  const bookFields = {
    title: sourceTranslation.title,
    slug: DEMO_BOOK_SLUG,
    description: sourceTranslation.description,
    author_id: authorId,
    status: "PUBLISHED" as const,
    published: true,
    published_at: new Date().toISOString(),
    language: ORIGINAL_LANGUAGE,
    original_language: ORIGINAL_LANGUAGE,
    demo_pod_enabled: false,
    demo_run_id: demoRunId,
  };

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from("books")
      .update(bookFields)
      .eq("id", existing.id);
    if (updateErr) throw new Error(`Update demo book failed: ${updateErr.message}`);
    console.log(`[seed] Demo book exists: ${existing.id}`);
    return existing.id;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("books")
    .insert(bookFields)
    .select("id")
    .single();
  if (insertErr || !inserted) {
    throw new Error(`Insert demo book failed: ${insertErr?.message ?? "no row returned"}`);
  }
  console.log(`[seed] Demo book created: ${inserted.id}`);
  return inserted.id;
}

async function upsertVersionAndChapter(
  supabase: SupabaseClient,
  bookId: string,
  demoRunId: string,
  translation: DemoTranslation
): Promise<{ versionId: string }> {
  const publishedAt = new Date().toISOString();

  const { data: existingVersion, error: lookupErr } = await supabase
    .from("book_versions")
    .select("id")
    .eq("book_id", bookId)
    .eq("language_code", translation.language_code)
    .maybeSingle();
  if (lookupErr) {
    throw new Error(
      `Lookup book_version (${translation.language_code}) failed: ${lookupErr.message}`
    );
  }

  let versionId: string;
  const versionFields = {
    book_id: bookId,
    language_code: translation.language_code,
    status: "done" as const,
    published_at: publishedAt,
    demo_run_id: demoRunId,
  };

  if (existingVersion?.id) {
    versionId = existingVersion.id;
    const { error: updateErr } = await supabase
      .from("book_versions")
      .update(versionFields)
      .eq("id", versionId);
    if (updateErr) {
      throw new Error(
        `Update book_version (${translation.language_code}) failed: ${updateErr.message}`
      );
    }
  } else {
    const { data: insertedVersion, error: insertErr } = await supabase
      .from("book_versions")
      .insert(versionFields)
      .select("id")
      .single();
    if (insertErr || !insertedVersion) {
      throw new Error(
        `Insert book_version (${translation.language_code}) failed: ${
          insertErr?.message ?? "no row returned"
        }`
      );
    }
    versionId = insertedVersion.id;
  }

  // Chapters are unique-by-(version, order=0) for this single-chapter demo.
  const { data: existingChapter, error: chLookupErr } = await supabase
    .from("chapters")
    .select("id")
    .eq("book_version_id", versionId)
    .eq("order", 0)
    .maybeSingle();
  if (chLookupErr) {
    throw new Error(
      `Lookup chapter (${translation.language_code}) failed: ${chLookupErr.message}`
    );
  }

  const chapterContent = JSON.stringify(translation.chapterDoc);
  const chapterFields = {
    book_id: bookId,
    book_version_id: versionId,
    title: translation.chapterTitle,
    content: chapterContent,
    order: 0,
  };

  if (existingChapter?.id) {
    const { error: updateChErr } = await supabase
      .from("chapters")
      .update(chapterFields)
      .eq("id", existingChapter.id);
    if (updateChErr) {
      throw new Error(
        `Update chapter (${translation.language_code}) failed: ${updateChErr.message}`
      );
    }
  } else {
    const { error: insertChErr } = await supabase.from("chapters").insert(chapterFields);
    if (insertChErr) {
      throw new Error(
        `Insert chapter (${translation.language_code}) failed: ${insertChErr.message}`
      );
    }
  }

  return { versionId };
}

async function upsertTranslationTracking(
  supabase: SupabaseClient,
  bookId: string,
  demoRunId: string,
  translation: DemoTranslation
): Promise<void> {
  // The book_translations table tracks non-source languages. The original
  // language doesn't get a row.
  if (translation.language_code === ORIGINAL_LANGUAGE) return;

  const fields = {
    book_id: bookId,
    language: translation.language_code,
    status: "completed" as const,
    progress: 100,
    demo_run_id: demoRunId,
  };

  const { error } = await supabase
    .from("book_translations")
    .upsert(fields, { onConflict: "book_id,language" });
  if (error) {
    throw new Error(
      `Upsert book_translations (${translation.language_code}) failed: ${error.message}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function main(): Promise<SeedResult> {
  assertSafeTarget();
  const supabase = createAdminClient();
  const demoRunId = randomUUID();
  console.log(`[seed] demo_run_id=${demoRunId}`);

  const authorId = await ensureDemoAuthor(supabase);
  const bookId = await ensureDemoBook(supabase, authorId, demoRunId);

  let versionsTouched = 0;
  let chaptersTouched = 0;
  let translationRowsTouched = 0;

  for (const translation of DEMO_TRANSLATIONS) {
    await upsertVersionAndChapter(supabase, bookId, demoRunId, translation);
    versionsTouched += 1;
    chaptersTouched += 1;
    await upsertTranslationTracking(supabase, bookId, demoRunId, translation);
    if (translation.language_code !== ORIGINAL_LANGUAGE) translationRowsTouched += 1;
    console.log(
      `[seed] [${translation.quality}] ${translation.language_code} — version+chapter ready`
    );
  }

  return {
    demoRunId,
    authorId,
    bookId,
    versionsTouched,
    chaptersTouched,
    translationRowsTouched,
  };
}

main()
  .then((result) => {
    console.log("\n[seed] Done.");
    console.log(`  demo_run_id:        ${result.demoRunId}`);
    console.log(`  author_id:          ${result.authorId}`);
    console.log(`  book_id:            ${result.bookId}`);
    console.log(`  versions touched:   ${result.versionsTouched}`);
    console.log(`  chapters touched:   ${result.chaptersTouched}`);
    console.log(`  translation rows:   ${result.translationRowsTouched}`);
    console.log(`  login email:        ${DEMO_AUTHOR_EMAIL}`);
    console.log(`  login password:     ${DEMO_AUTHOR_PASSWORD}`);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seed] Failed:", message);
    process.exit(1);
  });
