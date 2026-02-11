import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_RECOMMENDATIONS_LOAD_FAILED,
} from "@/lib/api-errors";
import { scoreSimilarBooks, type ScoredBook } from "@/lib/recommendations/scoring";
import { enrichWithAuthors } from "@/lib/recommendations/enrichment";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  try {
    // Get recently read books
    const { data: recentReadings, error: readingsError } = await supabase
      .from("readings")
      .select("book_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (readingsError) {
      console.error("[recommendations] readings query failed", {
        userId: user.id,
        message: readingsError.message,
      });
      return apiError(E_RECOMMENDATIONS_LOAD_FAILED, 500);
    }

    const readBookIds = [
      ...new Set((recentReadings ?? []).map((r) => r.book_id as string)),
    ];

    // If no reading history, return popular books (most bookmarked)
    if (readBookIds.length === 0) {
      const { data: popularBooks } = await supabase
        .from("books")
        .select("id, title, cover_image, author_id")
        .eq("status", "PUBLISHED")
        .order("created_at", { ascending: false })
        .limit(20);

      const popular: ScoredBook[] = (popularBooks ?? []).map((b, i) => ({
        id: b.id,
        title: b.title,
        cover_image: b.cover_image,
        author_id: b.author_id,
        score: 20 - i,
      }));

      const enriched = await enrichWithAuthors(supabase, popular);
      return NextResponse.json({ books: enriched, count: enriched.length });
    }

    // For each recently read book, get similar books
    const allScored: ScoredBook[] = [];
    const seenIds = new Set<string>(readBookIds);

    for (const bookId of readBookIds) {
      // Fetch book details for scoring context
      const { data: book } = await supabase
        .from("books")
        .select("id, author_id, language")
        .eq("id", bookId)
        .maybeSingle();

      if (!book) continue;

      // Fetch genres for this book
      const { data: bookGenres } = await supabase
        .from("book_genres")
        .select("genre_id")
        .eq("book_id", bookId);

      const genreIds = (bookGenres ?? []).map((bg) => bg.genre_id as string);

      const similar = await scoreSimilarBooks(
        supabase,
        bookId,
        book.author_id,
        book.language,
        genreIds,
        10
      );

      for (const s of similar) {
        if (!seenIds.has(s.id)) {
          seenIds.add(s.id);
          allScored.push(s);
        }
      }
    }

    // Sort by score descending, take top 20
    allScored.sort((a, b) => b.score - a.score);
    const top = allScored.slice(0, 20);

    const enriched = await enrichWithAuthors(supabase, top);
    return NextResponse.json({ books: enriched, count: enriched.length });
  } catch (err) {
    console.error("[recommendations] unexpected error", err);
    return apiError(E_RECOMMENDATIONS_LOAD_FAILED, 500);
  }
}
