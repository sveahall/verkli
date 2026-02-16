import { createClient } from "@/lib/supabase/server";
import { getRecommendationsEnabled } from "@/lib/flags";
import { scoreSimilarBooks } from "@/lib/recommendations/scoring";
import { enrichWithAuthors } from "@/lib/recommendations/enrichment";
import BookCard from "@/components/reader/BookCard";
import Rail from "@/components/reader/Rail";

interface SimilarBooksRailProps {
  bookId: string;
  authorId: string;
  language: string | null;
}

export default async function SimilarBooksRail({
  bookId,
  authorId,
  language,
}: SimilarBooksRailProps) {
  if (!getRecommendationsEnabled()) return null;

  const supabase = await createClient();

  // Get book's genres
  const { data: bookGenres } = await supabase
    .from("book_genres")
    .select("genre_id")
    .eq("book_id", bookId);

  const genreIds = (bookGenres ?? []).map((bg) => bg.genre_id);

  const scored = await scoreSimilarBooks(
    supabase,
    bookId,
    authorId,
    language,
    genreIds,
    8
  );

  if (scored.length === 0) return null;

  const enriched = await enrichWithAuthors(supabase, scored);

  return (
    <section className="mx-auto max-w-[1100px] px-6 pb-12">
      <Rail
        title="Similar books"
        description="Based on genre, author, and collections"
        isEmpty={false}
      >
        {enriched.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author_name}
            cover={book.cover_image}
          />
        ))}
      </Rail>
    </section>
  );
}
