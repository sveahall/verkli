import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { bookExists } from "@/lib/books/service";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_REVIEW_AGGREGATE_FAILED,
} from "@/lib/api-errors";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid book ID"),
});

type RatingRow = {
  rating: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Validation
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError(E_INVALID_BOOK_ID, 400);
  const bookId = parsedParams.data.id;

  const supabase = await createClient();

  // Book existence check
  const existsResult = await bookExists(supabase, bookId);
  if (!existsResult.ok) {
    return apiError(
      existsResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      existsResult.error === "book_not_found" ? 404 : 500,
    );
  }

  // Service call
  const { data: ratings, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("book_id", bookId);

  if (error) {
    console.error("[reviews.aggregate] load failed", {
      bookId,
      message: error.message,
    });
    return apiError(E_REVIEW_AGGREGATE_FAILED, 500);
  }

  // Response
  const rows = (ratings ?? []) as RatingRow[];
  const ratingsCount = rows.length;
  const averageRating =
    ratingsCount > 0
      ? Number(
          (
            rows.reduce((sum, row) => sum + Number(row.rating || 0), 0) /
            ratingsCount
          ).toFixed(2)
        )
      : null;

  return NextResponse.json(
    {
      ok: true,
      data: { bookId, averageRating, ratingsCount },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
