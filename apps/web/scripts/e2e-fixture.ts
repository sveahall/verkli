/**
 * Create or remove the E2E author fixture.
 *
 *   npm run e2e:fixture            # create (idempotent)
 *   npm run e2e:fixture -- --drop  # remove everything it made
 *
 * ── Why this exists, and what it costs ──────────────────────────────────────
 *
 * The authenticated flows — the AI assistant, cover generation, audiobook
 * production — are the parts most worth testing and the only parts no test
 * covers, because signing in needs an account. Without one, an agent testing
 * on the owner's behalf either tests nothing behind the login or borrows the
 * owner's identity. Neither is acceptable, so: a dedicated account.
 *
 * ── The uncomfortable part ──────────────────────────────────────────────────
 *
 * There is one Supabase project. This account is therefore created in
 * PRODUCTION, next to real authors and real books. Three things follow, and
 * they are requirements rather than preferences:
 *
 *   1. It must be unmistakable. The email carries `+e2e`, the display name says
 *      so in plain words, and the book title does too. Anyone finding these
 *      rows at 3am should know within one second what they are.
 *
 *   2. It must not be reachable by readers. The book stays `status: draft`,
 *      `published: false`, version `visibility: private`. It must never surface
 *      in discovery, search, or an author list.
 *
 *   3. It must be removable. `--drop` deletes the user, and the books cascade.
 *      A fixture you cannot delete is not a fixture, it is litter.
 *
 * `demo_mode` is deliberately NOT set: WP-05's acceptance criteria require no
 * account to carry it, and this one must not be the exception that breaks that
 * check.
 */

import "./load-dotenv";
import { createClient } from "@supabase/supabase-js";

const DROP = process.argv.includes("--drop");

const EMAIL = process.env.E2E_AUTHOR_EMAIL?.trim();
const PASSWORD = process.env.E2E_AUTHOR_PASSWORD?.trim();

const DISPLAY_NAME = "E2E test author (automated, safe to delete)";
const BOOK_TITLE = "E2E fixture — automated test book";
/** `slug` is NOT NULL and has no default; the app generates one at creation. */
const BOOK_SLUG = "e2e-fixture-automated-test-book";
const CHAPTER_TITLE = "E2E fixture chapter";

/**
 * Short on purpose. The audiobook worker bills ElevenLabs per character, so a
 * fixture chapter that reads like a novel turns every test run into real money.
 */
const CHAPTER_TEXT =
  "Detta är ett testkapitel. Det finns bara för automatiska tester och innehåller avsiktligt få tecken.";

function requireEnv(): { email: string; password: string; url: string; key: string } {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !EMAIL && "E2E_AUTHOR_EMAIL",
    !PASSWORD && "E2E_AUTHOR_PASSWORD",
    !url && "SUPABASE_URL",
    !key && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(`\n✖  Missing: ${missing.join(", ")}\n`);
    console.error("Add to apps/web/.env.local, for example:\n");
    console.error("  E2E_AUTHOR_EMAIL=svea+e2e@verkli.com");
    console.error("  E2E_AUTHOR_PASSWORD=<a long random string>\n");
    process.exit(1);
  }

  // A fixture that is not obviously a fixture is the thing to prevent here.
  if (!EMAIL!.includes("+e2e")) {
    console.error(
      `\n✖  E2E_AUTHOR_EMAIL must contain "+e2e" so the account is identifiable in production.\n`
    );
    process.exit(1);
  }

  return { email: EMAIL!, password: PASSWORD!, url: url!, key: key! };
}

const { email, password, url, key } = requireEnv();
const admin = createClient(url, key, { auth: { persistSession: false } });

async function findUserId(): Promise<string | null> {
  // listUsers is paginated; the fixture is findable within the first page in
  // any realistic account, and this avoids a full scan on every run.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function drop(): Promise<void> {
  const userId = await findUserId();
  if (!userId) {
    console.log(`\n✔  No fixture user for ${email}; nothing to remove.\n`);
    return;
  }

  // Books cascade from the user, but chapter_audio_cache and ai_jobs do not —
  // see the delete-order note in the project's own docs. Clear those first so
  // a dropped fixture does not leave orphans behind.
  const { data: books } = await admin.from("books").select("id").eq("author_id", userId);
  const bookIds = (books ?? []).map((b) => b.id as string);

  if (bookIds.length > 0) {
    const { data: chapters } = await admin
      .from("chapters")
      .select("id")
      .in("book_id", bookIds);
    const chapterIds = (chapters ?? []).map((c) => c.id as string);
    if (chapterIds.length > 0) {
      await admin.from("chapter_audio_cache").delete().in("chapter_id", chapterIds);
    }
    await admin.from("books").delete().in("id", bookIds);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);

  console.log(`\n✔  Removed fixture user ${email} and ${bookIds.length} book(s).\n`);
}

async function create(): Promise<void> {
  let userId = await findUserId();

  if (userId) {
    console.log(`   user       already exists (${userId.slice(0, 8)}…)`);
    // Reset the password so a rotated .env.local value still signs in.
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    userId = data.user.id;
    console.log(`   user       created (${userId.slice(0, 8)}…)`);
  }

  // A signup trigger provisions the profile row, so upsert rather than insert.
  // `role: author` is what requireAuthorRoleForApi checks; without it every
  // author API answers 403 and the fixture is useless.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      user_id: userId,
      display_name: DISPLAY_NAME,
      role: "author",
      is_public: false,
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw new Error(`profile upsert failed: ${profileError.message}`);
  console.log("   profile    role=author, is_public=false");

  const { data: existingBook } = await admin
    .from("books")
    .select("id")
    .eq("author_id", userId)
    .eq("title", BOOK_TITLE)
    .maybeSingle();

  let bookId = (existingBook as { id?: string } | null)?.id ?? null;

  if (!bookId) {
    const { data, error } = await admin
      .from("books")
      .insert({
        author_id: userId,
        title: BOOK_TITLE,
        slug: BOOK_SLUG,
        description: "Created by scripts/e2e-fixture.ts. Safe to delete.",
        language: "sv",
        // books.status is the uppercase enum; book_versions.status below is
        // lowercase. They are different enums that look alike — see
        // lib/books/service.ts, which writes "DRAFT" and "draft" respectively.
        status: "DRAFT",
        published: false,
        original_language: "sv",
        // `is_free` is a generated column — Postgres refuses a non-DEFAULT
        // value. It derives from price_amount, which is left unset.
      })
      .select("id")
      .single();
    if (error) throw new Error(`book insert failed: ${error.message}`);
    bookId = data.id as string;
    console.log(`   book       created (${bookId.slice(0, 8)}…)`);
  } else {
    console.log(`   book       already exists (${bookId.slice(0, 8)}…)`);
  }

  const { data: existingVersion } = await admin
    .from("book_versions")
    .select("id")
    .eq("book_id", bookId)
    .eq("language_code", "sv")
    .maybeSingle();

  let versionId = (existingVersion as { id?: string } | null)?.id ?? null;

  if (!versionId) {
    const { data, error } = await admin
      .from("book_versions")
      .insert({
        book_id: bookId,
        language_code: "sv",
        status: "draft",
        visibility: "private",
      })
      .select("id")
      .single();
    if (error) throw new Error(`book_version insert failed: ${error.message}`);
    versionId = data.id as string;
    console.log(`   version    created (${versionId.slice(0, 8)}…)`);
  } else {
    console.log(`   version    already exists (${versionId.slice(0, 8)}…)`);
  }

  const { data: existingChapter } = await admin
    .from("chapters")
    .select("id")
    .eq("book_id", bookId)
    .eq("title", CHAPTER_TITLE)
    .maybeSingle();

  if (!existingChapter) {
    const { error } = await admin.from("chapters").insert({
      book_id: bookId,
      book_version_id: versionId,
      title: CHAPTER_TITLE,
      content: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: CHAPTER_TEXT }] },
        ],
      }),
      order: 1,
    });
    if (error) throw new Error(`chapter insert failed: ${error.message}`);
    console.log("   chapter    created");
  } else {
    console.log("   chapter    already exists");
  }

  console.log(`\n✔  Fixture ready.\n`);
  console.log(`   Sign in at /author/signin as ${email}`);
  console.log(`   Book: ${BOOK_TITLE}`);
  console.log(`   Remove with: npm run e2e:fixture -- --drop\n`);
}

async function main() {
  console.log(`\n══ E2E fixture — ${DROP ? "REMOVE" : "CREATE"} ══\n`);
  console.log(`   target     ${url}`);
  console.log(`   email      ${email}\n`);
  if (DROP) await drop();
  else await create();
}

main().catch((err) => {
  console.error(`\n✖  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
