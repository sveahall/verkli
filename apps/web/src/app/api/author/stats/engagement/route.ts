import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { apiError, E_DATABASE_ERROR } from "@/lib/api-errors";
import { fetchAllRows, resolveAuthorBooks } from "@/lib/author/stats-scope";

export async function GET() {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Ownership via the session client (RLS-enforced); counts via service role,
  // because `bookmarks` is keyed to the reader who saved the book, not the
  // author who wrote it.
  const owned = await resolveAuthorBooks(supabase, user.id);
  if (!owned.ok) {
    console.error("[author/stats/engagement] books load failed", {
      userId: user.id,
      message: owned.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const { bookIds } = owned;
  const admin = createAdminClient();

  if (bookIds.length === 0) {
    // Followers are not book-scoped, so they still count for an author with no
    // published books.
    // `follows` is keyed (follower_id, followee_id) and has no `id` column, so
    // selecting one errors and PostgREST returns no count — which rendered as
    // a confident zero followers rather than a failure.
    const { count: followerOnly, error } = await admin
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("followee_id", user.id);

    if (error) {
      console.error("[author/stats/engagement] follows load failed", {
        userId: user.id,
        message: error.message,
      });
    }

    return NextResponse.json({
      reviews: 0,
      averageRating: 0,
      bookmarks: 0,
      comments: 0,
      followers: followerOnly ?? 0,
    });
  }

  const [reviewsRes, bookmarksRes, followersRes, commentsRes] = await Promise.all([
    // Soft-deleted rows are hidden from ordinary reads by a RESTRICTIVE RLS
    // policy, but the admin client bypasses RLS — so moderation-removed
    // comments and reviews would still be counted here without this filter.
    admin
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .in("book_id", bookIds)
      .is("deleted_at", null),
    admin.from("bookmarks").select("id", { count: "exact", head: true }).in("book_id", bookIds),
    admin
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("followee_id", user.id),
    // Reader comments only — an author replying in their own thread is not
    // engagement they received.
    admin
      .from("comments")
      .select("id", { count: "exact", head: true })
      .in("book_id", bookIds)
      .neq("author_id", user.id)
      .is("deleted_at", null),
  ]);

  for (const [table, res] of [
    ["reviews", reviewsRes],
    ["bookmarks", bookmarksRes],
    ["follows", followersRes],
    ["comments", commentsRes],
  ] as const) {
    if (res.error) {
      console.error("[author/stats/engagement] count failed", {
        userId: user.id,
        table,
        message: res.error.message,
      });
    }
  }

  let averageRating = 0;
  if ((reviewsRes.count ?? 0) > 0) {
    // `.limit(5000)` did not raise PostgREST's max_rows = 1000 cap, so the
    // average was computed from an arbitrary first page while the count beside
    // it was exact. Page instead.
    const { rows: reviews, error } = await fetchAllRows<{ rating: number | string | null }>(
      (from, to) =>
        admin
        .from("reviews")
        .select("rating")
        .in("book_id", bookIds)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to)
    );
    if (error) {
      console.error("[author/stats/engagement] ratings load failed", {
        userId: user.id,
        message: error,
      });
    }
    if (reviews.length > 0) {
      averageRating =
        reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length;
    }
  }

  return NextResponse.json({
    reviews: reviewsRes.count ?? 0,
    averageRating: Math.round(averageRating * 10) / 10,
    bookmarks: bookmarksRes.count ?? 0,
    comments: commentsRes.count ?? 0,
    followers: followersRes.count ?? 0,
  });
}
