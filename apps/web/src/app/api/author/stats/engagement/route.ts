import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";

export async function GET() {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Get author's book IDs
  const { data: books } = await supabase
    .from("books")
    .select("id")
    .eq("author_id", user.id);

  const bookIds = (books ?? []).map((b) => b.id as string);

  if (bookIds.length === 0) {
    return NextResponse.json({
      reviews: 0,
      averageRating: 0,
      bookmarks: 0,
      followers: 0,
    });
  }

  // Count reviews, bookmarks, and followers in parallel (all independent)
  const [{ count: reviewCount }, { count: bookmarkCount }, { count: followerCount }] =
    await Promise.all([
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .in("book_id", bookIds),
      supabase
        .from("bookmarks")
        .select("id", { count: "exact", head: true })
        .in("book_id", bookIds),
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("followee_id", user.id),
    ]);

  let averageRating = 0;
  if ((reviewCount ?? 0) > 0) {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .in("book_id", bookIds)
      .limit(5000);
    if (reviews && reviews.length > 0) {
      averageRating =
        reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length;
    }
  }

  return NextResponse.json({
    reviews: reviewCount ?? 0,
    averageRating: Math.round(averageRating * 10) / 10,
    bookmarks: bookmarkCount ?? 0,
    followers: followerCount ?? 0,
  });
}
