import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

/**
 * The generated `Tables<"books">` type is missing columns that exist in the DB
 * but have not been regenerated into the types file (price_amount, price_currency,
 * pricing_model, is_free, setup_state, etc.). We extend with the known extras so
 * callers can opt into a wider select when they need those fields.
 */
export type BookRow = Tables<"books">;

export type BookRowExtended = BookRow & {
  price_amount?: number | null;
  price_currency?: string | null;
  pricing_model?: string | null;
  is_free?: boolean | null;
  setup_state?: unknown;
};

export type ChapterRow = Tables<"chapters">;

export type BookVersionRow = Tables<"book_versions">;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Book ownership verification
// ---------------------------------------------------------------------------

/**
 * Fetch a book by ID and verify that `userId` is the author.
 *
 * This pattern is repeated in 18+ API routes. Centralizing it here means a
 * single place to update if the ownership check ever needs to change (e.g.
 * adding collaborator support).
 *
 * @param select - Supabase select string. Defaults to "id, author_id" but
 *   callers can widen it (e.g. "id, author_id, title, cover_image") and then
 *   narrow the returned type with the generic parameter.
 */
export async function getBookAsOwner<T extends { id: string; author_id: string } = BookRow>(
  supabase: SupabaseClient,
  bookId: string,
  userId: string,
  select = "*",
): Promise<ServiceResult<T>> {
  const { data: book, error } = await supabase
    .from("books")
    .select(select)
    .eq("id", bookId)
    .maybeSingle();

  if (error) {
    console.error("[books/service.getBookAsOwner] lookup failed", {
      bookId,
      userId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  if (!book) {
    return { ok: false, error: "book_not_found" };
  }

  const row = book as unknown as T;
  if (row.author_id !== userId) {
    return { ok: false, error: "book_not_found" };
  }

  return { ok: true, data: row };
}

// ---------------------------------------------------------------------------
// Book versions
// ---------------------------------------------------------------------------

/**
 * Get all versions for a book, ordered by most recently updated first.
 */
export async function getBookVersions(
  supabase: SupabaseClient,
  bookId: string,
  options?: { select?: string },
): Promise<ServiceResult<BookVersionRow[]>> {
  const select = options?.select ?? "id, book_id, language_code, status, published_at, published_chapter_count, created_at, updated_at";

  const { data, error } = await supabase
    .from("book_versions")
    .select(select)
    .eq("book_id", bookId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[books/service.getBookVersions] query failed", {
      bookId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  return { ok: true, data: (data ?? []) as unknown as BookVersionRow[] };
}

/**
 * Get the latest version for a book (by `updated_at` descending).
 * Commonly used to resolve "current" version before fetching chapters.
 */
export async function getLatestBookVersion(
  supabase: SupabaseClient,
  bookId: string,
  options?: { languageCode?: string; select?: string },
): Promise<ServiceResult<BookVersionRow | null>> {
  const select = options?.select ?? "id, book_id, language_code, status, published_at, published_chapter_count, created_at, updated_at";

  let query = supabase
    .from("book_versions")
    .select(select)
    .eq("book_id", bookId);

  if (options?.languageCode) {
    query = query.eq("language_code", options.languageCode);
  }

  query = query.order("updated_at", { ascending: false }).limit(1);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[books/service.getLatestBookVersion] query failed", {
      bookId,
      languageCode: options?.languageCode ?? null,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  return { ok: true, data: data as unknown as BookVersionRow | null };
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

/**
 * Get chapters for a book, optionally scoped to a specific version.
 *
 * When no `versionId` is provided the function fetches the latest version
 * first, matching the pattern used in the chapters and publish routes.
 */
export async function getChaptersForBook(
  supabase: SupabaseClient,
  bookId: string,
  options?: { versionId?: string; select?: string },
): Promise<ServiceResult<ChapterRow[]>> {
  let versionId = options?.versionId ?? null;

  if (!versionId) {
    const versionResult = await getLatestBookVersion(supabase, bookId);
    if (!versionResult.ok) {
      return { ok: false, error: versionResult.error };
    }
    if (!versionResult.data) {
      // No version exists yet -- return empty list rather than an error
      return { ok: true, data: [] };
    }
    versionId = versionResult.data.id;
  }

  const select = options?.select ?? "id, book_id, book_version_id, title, content, order, created_at, updated_at";

  const { data, error } = await supabase
    .from("chapters")
    .select(select)
    .eq("book_id", bookId)
    .eq("book_version_id", versionId)
    .order("order", { ascending: true });

  if (error) {
    console.error("[books/service.getChaptersForBook] query failed", {
      bookId,
      versionId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  return { ok: true, data: (data ?? []) as unknown as ChapterRow[] };
}

/**
 * Create a single chapter in a given book version.
 */
export async function createChapter(
  supabase: SupabaseClient,
  bookId: string,
  versionId: string,
  data: { title: string; content?: string; order: number },
): Promise<ServiceResult<ChapterRow>> {
  const { data: chapter, error } = await supabase
    .from("chapters")
    .insert({
      book_id: bookId,
      book_version_id: versionId,
      title: data.title,
      content: data.content ?? "",
      order: data.order,
    })
    .select()
    .single();

  if (error) {
    console.error("[books/service.createChapter] insert failed", {
      bookId,
      versionId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  return { ok: true, data: chapter as unknown as ChapterRow };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convenience that combines `getBookAsOwner` + `getLatestBookVersion` -- the
 * two-step preamble used by many author-facing routes.
 */
export async function getBookWithLatestVersion(
  supabase: SupabaseClient,
  bookId: string,
  userId: string,
  options?: { bookSelect?: string; versionSelect?: string; languageCode?: string },
): Promise<
  | { ok: true; book: BookRow; version: BookVersionRow | null }
  | { ok: false; error: string }
> {
  const bookResult = await getBookAsOwner(
    supabase,
    bookId,
    userId,
    options?.bookSelect,
  );
  if (!bookResult.ok) {
    return bookResult;
  }

  const versionResult = await getLatestBookVersion(supabase, bookId, {
    languageCode: options?.languageCode,
    select: options?.versionSelect,
  });
  if (!versionResult.ok) {
    return versionResult;
  }

  return { ok: true, book: bookResult.data, version: versionResult.data };
}

// ---------------------------------------------------------------------------
// Book existence (no ownership check)
// ---------------------------------------------------------------------------

/**
 * Check if a book exists without verifying ownership.
 * Used by public-facing routes (reviews, comments) that only need existence.
 */
export async function bookExists(
  supabase: SupabaseClient,
  bookId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("books")
    .select("id")
    .eq("id", bookId)
    .maybeSingle();

  if (error) {
    console.error("[books/service.bookExists] lookup failed", {
      bookId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  if (!data) {
    return { ok: false, error: "book_not_found" };
  }

  return { ok: true, data: { id: data.id as string } };
}

// ---------------------------------------------------------------------------
// Book creation
// ---------------------------------------------------------------------------

/**
 * Create a new book with its first version and a default empty chapter.
 *
 * Consolidates the three-step insert (book → version → chapter) that was
 * previously inlined in the POST /api/books route.
 */
export async function createBook(
  supabase: SupabaseClient,
  params: {
    authorId: string;
    title: string;
    description: string | null;
    slug: string;
    language: string;
    originalSource?: string | null;
    originalUrl?: string | null;
  },
): Promise<ServiceResult<{ bookId: string; versionId: string }>> {
  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      title: params.title,
      description: params.description,
      slug: params.slug,
      author_id: params.authorId,
      status: "DRAFT",
      language: params.language,
      original_language: params.language,
      original_source: params.originalSource ?? null,
      original_url: params.originalUrl ?? null,
    })
    .select("id")
    .single();

  if (bookError) {
    console.error("[books/service.createBook] insert failed", {
      code: bookError.code,
      message: bookError.message,
    });
    return { ok: false, error: "database_error" };
  }

  if (!book?.id) {
    return { ok: false, error: "book_creation_incomplete" };
  }

  const { data: version, error: versionError } = await supabase
    .from("book_versions")
    .insert({
      book_id: book.id,
      language_code: params.language,
      status: "draft",
    })
    .select("id")
    .single();

  if (versionError || !version?.id) {
    console.error("[books/service.createBook] version insert failed", {
      bookId: book.id,
      message: versionError?.message,
    });
    return { ok: false, error: "version_creation_failed" };
  }

  const { error: chapterError } = await supabase.from("chapters").insert({
    book_id: book.id,
    book_version_id: version.id,
    title: "Chapter 1",
    content: "",
    order: 0,
  });

  if (chapterError) {
    console.error("[books/service.createBook] default chapter insert failed", {
      bookId: book.id,
      message: chapterError.message,
    });
    return { ok: false, error: "default_chapter_creation_failed" };
  }

  return { ok: true, data: { bookId: book.id, versionId: version.id } };
}

// ---------------------------------------------------------------------------
// Chapter count
// ---------------------------------------------------------------------------

/**
 * Count the number of chapters in a specific book version.
 * Used by translation-progress to compare source vs target counts.
 */
export async function countChaptersForVersion(
  supabase: SupabaseClient,
  versionId: string,
): Promise<ServiceResult<number>> {
  const { count, error } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("book_version_id", versionId);

  if (error) {
    console.error("[books/service.countChaptersForVersion] query failed", {
      versionId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "database_error" };
  }

  return { ok: true, data: count ?? 0 };
}
