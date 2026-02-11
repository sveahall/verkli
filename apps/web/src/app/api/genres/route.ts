import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_GENRES_LOAD_FAILED } from "@/lib/api-errors";

const FALLBACK_GENRES = [
  "Fiction",
  "Non-Fiction",
  "Fantasy",
  "Sci-Fi",
  "Romance",
  "Mystery",
  "Thriller",
  "Horror",
  "Biography",
  "Self-Help",
  "History",
  "Poetry",
  "Drama",
  "Children",
  "Young Adult",
  "Comics",
];

export async function GET() {
  try {
    const supabase = await createClient();

    // Try to query the genres table
    const { data: rows, error } = await supabase
      .from("genres")
      .select("id, name")
      .order("name");

    if (!error && rows && rows.length > 0) {
      return NextResponse.json({
        genres: rows.map((r) => ({ id: String(r.id), name: String(r.name) })),
      });
    }

    // Fall back to hardcoded list if genres table doesn't exist or is empty
    const genres = FALLBACK_GENRES.map((name, i) => ({
      id: `genre-${i}`,
      name,
    }));

    return NextResponse.json({ genres });
  } catch (err) {
    console.error("[genres] unexpected error", err);
    return apiError(E_GENRES_LOAD_FAILED, 500);
  }
}
