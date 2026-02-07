/**
 * Seed script – creates demo data for Verkli MVP.
 *
 * Creates:
 *   1 author (demo-author@verkli.test / DemoPass123!)
 *   1 book with 2 chapters (PUBLISHED)
 *   1 reader (demo-reader@verkli.test / DemoPass123!)
 *   1 reading progress record (50 %)
 *   1 bookmark
 *
 * Usage:
 *   npx tsx apps/web/scripts/seed.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local
 */

import "./load-dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";

const AUTHOR_EMAIL = "demo-author@verkli.test";
const READER_EMAIL = "demo-reader@verkli.test";
const PASSWORD = "DemoPass123!";

const BOOK_TITLE = "The Art of Multilingual Storytelling";
const BOOK_DESCRIPTION =
  "A practical guide to writing stories that resonate across languages and cultures.";
const BOOK_LANGUAGE = "en";

const CHAPTERS = [
  {
    title: "Chapter 1: Why Language Matters",
    order: 0,
    content: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Why Language Matters" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Every story begins with a single word. But the language you choose to tell that story in shapes everything — the rhythm of your sentences, the images you invoke, and the emotions you stir in your reader.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "In this chapter, we explore how multilingual authors can leverage the unique strengths of different languages to create richer, more nuanced narratives. Whether you write in English, Spanish, French, or Swedish, each tongue offers tools that others lack.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The key insight is simple: translation is not just about converting words. It is about re-imagining a story for a new audience while preserving its soul.",
            },
          ],
        },
      ],
    }),
  },
  {
    title: "Chapter 2: Building Your Workflow",
    order: 1,
    content: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Building Your Workflow" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "A successful multilingual publishing workflow starts with structure. Before you write a single word, decide on your primary language, your target languages, and the order of operations.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Verkli streamlines this process. Write in your native language, publish, and let the platform handle translation, audiobook generation, and marketing — step by step.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The workflow is: Create, Write, Translate, Publish, Promote. Each step builds on the last, and Verkli guides you through every transition.",
            },
          ],
        },
      ],
    }),
  },
];

async function main() {
  const supabase = createAdminClient();

  // ── 1. Create author user ────────────────────────────────────────────────
  console.log("[seed] Creating author user...");
  const { data: existingAuthor } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", "demo-author")
    .maybeSingle();

  let authorId: string;

  if (existingAuthor) {
    authorId = existingAuthor.user_id;
    console.log("[seed] Author already exists:", authorId);
  } else {
    const { data: authorUser, error: authorErr } =
      await supabase.auth.admin.createUser({
        email: AUTHOR_EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { role: "author", full_name: "Demo Author" },
      });
    if (authorErr) throw new Error(`Failed to create author: ${authorErr.message}`);
    authorId = authorUser.user.id;

    await supabase.from("profiles").upsert(
      {
        user_id: authorId,
        display_name: "Demo Author",
        username: "demo-author",
        bio: "A multilingual storyteller exploring the art of cross-cultural narratives.",
        role: "author",
        is_public: true,
        preferences: {},
      },
      { onConflict: "user_id" }
    );
    console.log("[seed] Author created:", authorId);
  }

  // ── 2. Create book ───────────────────────────────────────────────────────
  console.log("[seed] Creating book...");
  const slug = `the-art-of-multilingual-storytelling-${Date.now()}`;

  const { data: book, error: bookErr } = await supabase
    .from("books")
    .insert({
      title: BOOK_TITLE,
      description: BOOK_DESCRIPTION,
      slug,
      author_id: authorId,
      status: "PUBLISHED",
      published: true,
      published_at: new Date().toISOString(),
      language: BOOK_LANGUAGE,
      original_language: BOOK_LANGUAGE,
    })
    .select("id")
    .single();
  if (bookErr) throw new Error(`Failed to create book: ${bookErr.message}`);
  console.log("[seed] Book created:", book.id);

  // ── 3. Create book version ───────────────────────────────────────────────
  const { data: version, error: versionErr } = await supabase
    .from("book_versions")
    .insert({
      book_id: book.id,
      language_code: BOOK_LANGUAGE,
      status: "done",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (versionErr) throw new Error(`Failed to create version: ${versionErr.message}`);
  console.log("[seed] Book version created:", version.id);

  // ── 4. Create chapters ───────────────────────────────────────────────────
  for (const ch of CHAPTERS) {
    const { error: chErr } = await supabase.from("chapters").insert({
      book_id: book.id,
      book_version_id: version.id,
      title: ch.title,
      content: ch.content,
      order: ch.order,
    });
    if (chErr) throw new Error(`Failed to create chapter "${ch.title}": ${chErr.message}`);
    console.log(`[seed] Chapter created: ${ch.title}`);
  }

  // ── 5. Create reader user ───────────────────────────────────────────────
  console.log("[seed] Creating reader user...");
  const { data: existingReader } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", "demo-reader")
    .maybeSingle();

  let readerId: string;

  if (existingReader) {
    readerId = existingReader.user_id;
    console.log("[seed] Reader already exists:", readerId);
  } else {
    const { data: readerUser, error: readerErr } =
      await supabase.auth.admin.createUser({
        email: READER_EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { role: "reader", full_name: "Demo Reader" },
      });
    if (readerErr) throw new Error(`Failed to create reader: ${readerErr.message}`);
    readerId = readerUser.user.id;

    await supabase.from("profiles").upsert(
      {
        user_id: readerId,
        display_name: "Demo Reader",
        username: "demo-reader",
        bio: "An avid reader who loves discovering stories in multiple languages.",
        role: "reader",
        is_public: false,
        preferences: {},
      },
      { onConflict: "user_id" }
    );
    console.log("[seed] Reader created:", readerId);
  }

  // ── 6. Create reading progress ──────────────────────────────────────────
  const { data: firstChapter } = await supabase
    .from("chapters")
    .select("id")
    .eq("book_id", book.id)
    .order("order", { ascending: true })
    .limit(1)
    .single();

  if (firstChapter) {
    await supabase.from("readings").upsert(
      {
        user_id: readerId,
        book_id: book.id,
        chapter_id: firstChapter.id,
        progress_percent: 50,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" }
    );
    console.log("[seed] Reading progress created (50%)");
  }

  // ── 7. Create bookmark ─────────────────────────────────────────────────
  await supabase.from("bookmarks").upsert(
    {
      user_id: readerId,
      book_id: book.id,
    },
    { onConflict: "user_id,book_id" }
  );
  console.log("[seed] Bookmark created");

  // ── Done ────────────────────────────────────────────────────────────────
  console.log("\n[seed] Done! Demo data ready.");
  console.log(`  Author: ${AUTHOR_EMAIL} / ${PASSWORD}`);
  console.log(`  Reader: ${READER_EMAIL} / ${PASSWORD}`);
  console.log(`  Book:   "${BOOK_TITLE}" (${book.id})`);
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
