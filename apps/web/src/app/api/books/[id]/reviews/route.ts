import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_ALREADY_REVIEWED,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_INVALID_BOOK_VERSION,
  E_INVALID_JSON,
  E_NOT_AUTHENTICATED,
  E_REVIEW_NOT_FOUND,
  E_REVIEWS_LOAD_FAILED,
  E_REVIEW_SUBMIT_FAILED,
  E_REVIEW_UPDATE_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid book ID"),
});

const createReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().max(2000).optional().nullable(),
  bookVersionId: z.string().uuid().optional().nullable(),
});

const updateReviewBodySchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    content: z.string().max(2000).optional().nullable(),
    bookVersionId: z.string().uuid().optional().nullable(),
  })
  .refine(
    (payload) =>
      payload.rating !== undefined ||
      payload.content !== undefined ||
      payload.bookVersionId !== undefined,
    { message: "At least one update field is required." }
  );

const REVIEW_SELECT = "id, user_id, book_id, book_version_id, rating, content, created_at, updated_at";

type ReviewRow = {
  id: string;
  user_id: string;
  book_id: string;
  book_version_id: string | null;
  rating: number;
  content: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
};

function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function parsePageSize(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 5;
  return Math.min(parsed, 20);
}

function normalizeContent(content: string | null | undefined): string | null {
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveReviewerName(row: ReviewRow, profileMap: Map<string, string>): string {
  return profileMap.get(row.user_id) ?? "Reader";
}

function mapReview(
  row: ReviewRow,
  options: {
    profileMap: Map<string, string>;
    viewerUserId: string | null;
  }
) {
  return {
    id: row.id,
    bookId: row.book_id,
    bookVersionId: row.book_version_id,
    rating: row.rating,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewerName:
      options.viewerUserId && options.viewerUserId === row.user_id
        ? "You"
        : resolveReviewerName(row, options.profileMap),
    isMine: options.viewerUserId === row.user_id,
  };
}

async function ensureReadableBook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string
) {
  const { data: book, error } = await supabase
    .from("books")
    .select("id")
    .eq("id", bookId)
    .maybeSingle();

  if (error) {
    console.error("[reviews] book lookup failed", { bookId, message: error.message });
    return { ok: false as const, response: apiError(E_DATABASE_ERROR, 500) };
  }

  if (!book) {
    return { ok: false as const, response: apiError(E_BOOK_NOT_FOUND, 404) };
  }

  return { ok: true as const };
}

async function ensureVersionBelongsToBook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  bookVersionId: string
) {
  const { data: version, error } = await supabase
    .from("book_versions")
    .select("id")
    .eq("id", bookVersionId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) {
    console.error("[reviews] version lookup failed", {
      bookId,
      bookVersionId,
      message: error.message,
    });
    return { ok: false as const, response: apiError(E_DATABASE_ERROR, 500) };
  }

  if (!version) {
    return { ok: false as const, response: apiError(E_INVALID_BOOK_VERSION, 400) };
  }

  return { ok: true as const };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError(E_INVALID_BOOK_ID, 400);
  const bookId = parsedParams.data.id;

  const supabase = await createClient();
  const readableBook = await ensureReadableBook(supabase, bookId);
  if (!readableBook.ok) return readableBook.response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get("page"));
  const pageSize = parsePageSize(url.searchParams.get("limit"));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: rows, error, count } = await supabase
    .from("reviews")
    .select(REVIEW_SELECT, { count: "exact" })
    .eq("book_id", bookId)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[reviews] list failed", { bookId, message: error.message });
    return apiError(E_REVIEWS_LOAD_FAILED, 500);
  }

  let myReviewRow: ReviewRow | null = null;
  if (user?.id) {
    const { data: myReview, error: myReviewError } = await supabase
      .from("reviews")
      .select(REVIEW_SELECT)
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (myReviewError) {
      console.error("[reviews] own review lookup failed", {
        bookId,
        userId: user.id,
        message: myReviewError.message,
      });
      return apiError(E_REVIEWS_LOAD_FAILED, 500);
    }

    myReviewRow = (myReview as ReviewRow | null) ?? null;
  }

  const reviewRows = (rows ?? []) as ReviewRow[];
  const userIds = Array.from(
    new Set(
      reviewRows
        .map((row) => row.user_id)
        .concat(myReviewRow?.user_id ?? [])
        .filter(Boolean)
    )
  );

  let profileMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", userIds);

    if (profilesError) {
      console.warn("[reviews] profile lookup failed", { message: profilesError.message });
    } else {
      profileMap = new Map(
        ((profiles ?? []) as ProfileRow[]).map((profile) => [
          profile.user_id,
          profile.display_name?.trim() || profile.username?.trim() || "Reader",
        ])
      );
    }
  }

  const viewerUserId = user?.id ?? null;
  const totalCount = count ?? reviewRows.length;
  const hasMore = from + reviewRows.length < totalCount;

  return NextResponse.json({
    reviews: reviewRows.map((row) =>
      mapReview(row, {
        profileMap,
        viewerUserId,
      })
    ),
    myReview: myReviewRow
      ? mapReview(myReviewRow, {
          profileMap,
          viewerUserId,
        })
      : null,
    page,
    pageSize,
    totalCount,
    hasMore,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError(E_INVALID_BOOK_ID, 400);
  const bookId = parsedParams.data.id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiError(E_NOT_AUTHENTICATED, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsedBody = createReviewBodySchema.safeParse(body);
  if (!parsedBody.success) return apiError(E_VALIDATION_FAILED, 400);

  const readableBook = await ensureReadableBook(supabase, bookId);
  if (!readableBook.ok) return readableBook.response;

  const bookVersionId = parsedBody.data.bookVersionId ?? null;
  if (bookVersionId) {
    const versionCheck = await ensureVersionBelongsToBook(supabase, bookId, bookVersionId);
    if (!versionCheck.ok) return versionCheck.response;
  }

  const { data: created, error } = await supabase
    .from("reviews")
    .insert({
      user_id: user.id,
      book_id: bookId,
      book_version_id: bookVersionId,
      rating: parsedBody.data.rating,
      content: normalizeContent(parsedBody.data.content),
    })
    .select(REVIEW_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(E_ALREADY_REVIEWED, 409);
    }

    if (error.code === "23503") {
      return apiError(E_INVALID_BOOK_VERSION, 400);
    }

    console.error("[reviews] submit failed", {
      bookId,
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_REVIEW_SUBMIT_FAILED, 500);
  }

  return NextResponse.json({
    review: mapReview(created as ReviewRow, {
      profileMap: new Map<string, string>(),
      viewerUserId: user.id,
    }),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError(E_INVALID_BOOK_ID, 400);
  const bookId = parsedParams.data.id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiError(E_NOT_AUTHENTICATED, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsedBody = updateReviewBodySchema.safeParse(body);
  if (!parsedBody.success) return apiError(E_VALIDATION_FAILED, 400);

  const readableBook = await ensureReadableBook(supabase, bookId);
  if (!readableBook.ok) return readableBook.response;

  if (parsedBody.data.bookVersionId) {
    const versionCheck = await ensureVersionBelongsToBook(
      supabase,
      bookId,
      parsedBody.data.bookVersionId
    );
    if (!versionCheck.ok) return versionCheck.response;
  }

  const updates: {
    rating?: number;
    content?: string | null;
    book_version_id?: string | null;
  } = {};

  if (parsedBody.data.rating !== undefined) {
    updates.rating = parsedBody.data.rating;
  }

  if (parsedBody.data.content !== undefined) {
    updates.content = normalizeContent(parsedBody.data.content);
  }

  if (parsedBody.data.bookVersionId !== undefined) {
    updates.book_version_id = parsedBody.data.bookVersionId;
  }

  const { data: updated, error } = await supabase
    .from("reviews")
    .update(updates)
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .select(REVIEW_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return apiError(E_INVALID_BOOK_VERSION, 400);
    }

    console.error("[reviews] update failed", {
      bookId,
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_REVIEW_UPDATE_FAILED, 500);
  }

  if (!updated) {
    return apiError(E_REVIEW_NOT_FOUND, 404);
  }

  return NextResponse.json({
    review: mapReview(updated as ReviewRow, {
      profileMap: new Map<string, string>(),
      viewerUserId: user.id,
    }),
  });
}
