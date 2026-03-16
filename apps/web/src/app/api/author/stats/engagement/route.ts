import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_FORBIDDEN,
} from "@/lib/api-errors";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "author") {
    return apiError(E_FORBIDDEN, 403);
  }

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

  // Count reviews and average rating
  const { count: reviewCount } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .in("book_id", bookIds);

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

  // Count bookmarks
  const { count: bookmarkCount } = await supabase
    .from("bookmarks")
    .select("id", { count: "exact", head: true })
    .in("book_id", bookIds);

  // Count followers
  const { count: followerCount } = await supabase
    .from("follows")
    .select("id", { count: "exact", head: true })
    .eq("followee_id", user.id);

  return NextResponse.json({
    reviews: reviewCount ?? 0,
    averageRating: Math.round(averageRating * 10) / 10,
    bookmarks: bookmarkCount ?? 0,
    followers: followerCount ?? 0,
  });
}
