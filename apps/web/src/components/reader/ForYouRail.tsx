import { createClient } from "@/lib/supabase/server";
import { getRecommendationsEnabled } from "@/lib/flags";
import BookCard from "@/components/reader/BookCard";
import Rail from "@/components/reader/Rail";

export default async function ForYouRail({ userId }: { userId: string }) {
  if (!getRecommendationsEnabled()) return null;

  const supabase = await createClient();

  // Try precomputed recommendations
  const { data: recs } = await supabase
    .from("recommendations")
    .select("book_id, score, reason, rank")
    .eq("user_id", userId)
    .order("rank", { ascending: true })
    .limit(12);

  let bookResults: Array<{
    id: string;
    title: string;
    cover: string | null;
    author: string;
  }> = [];

  if (recs && recs.length > 0) {
    const bookIds = recs.map((r) => r.book_id);
    const { data: books } = await supabase
      .from("books")
      .select("id, title, cover_image, author_id")
      .eq("status", "PUBLISHED")
      .in("id", bookIds);

    if (books && books.length > 0) {
      const bookMap = new Map(books.map((b) => [b.id, b]));
      const authorIds = [...new Set(books.map((b) => b.author_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", authorIds);

      const authorMap = new Map(
        (profiles ?? []).map((p) => [
          p.user_id,
          p.display_name || p.username || "Author",
        ])
      );

      bookResults = recs
        .map((r) => {
          const book = bookMap.get(r.book_id);
          if (!book) return null;
          return {
            id: book.id,
            title: book.title,
            cover: book.cover_image,
            author: authorMap.get(book.author_id) ?? "Author",
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
    }
  }

  // Cold start fallback: use genre preferences
  if (bookResults.length === 0) {
    const { data: genrePrefs } = await supabase
      .from("reader_genre_preferences")
      .select("genre_id")
      .eq("user_id", userId);

    const genreIds = (genrePrefs ?? []).map((p) => p.genre_id);

    if (genreIds.length > 0) {
      const { data: bookGenres } = await supabase
        .from("book_genres")
        .select("book_id")
        .in("genre_id", genreIds);

      const matchedIds = [...new Set((bookGenres ?? []).map((bg) => bg.book_id))].slice(0, 12);

      if (matchedIds.length > 0) {
        const { data: books } = await supabase
          .from("books")
          .select("id, title, cover_image, author_id")
          .eq("status", "PUBLISHED")
          .in("id", matchedIds)
          .order("published_at", { ascending: false })
          .limit(12);

        if (books && books.length > 0) {
          const authorIds = [...new Set(books.map((b) => b.author_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, display_name, username")
            .in("user_id", authorIds);

          const authorMap = new Map(
            (profiles ?? []).map((p) => [
              p.user_id,
              p.display_name || p.username || "Author",
            ])
          );

          bookResults = books.map((book) => ({
            id: book.id,
            title: book.title,
            cover: book.cover_image,
            author: authorMap.get(book.author_id) ?? "Author",
          }));
        }
      }
    }
  }

  if (bookResults.length === 0) return null;

  return (
    <Rail
      title="Recommended for you"
      description="Based on your genres and reading history"
      isEmpty={false}
    >
      {bookResults.map((book) => (
        <BookCard
          key={book.id}
          id={book.id}
          title={book.title}
          author={book.author}
          cover={book.cover}
        />
      ))}
    </Rail>
  );
}
