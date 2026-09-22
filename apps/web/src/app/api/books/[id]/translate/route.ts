import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueTranslationJob } from "@/lib/translation-queue";
import { isSupportedLanguage } from "@/lib/languages";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;

  const body = await request.json().catch(() => ({}));
  const targetLanguage = typeof body?.targetLanguage === "string" ? body.targetLanguage.trim().toLowerCase() : "";

  if (!targetLanguage || !isSupportedLanguage(targetLanguage)) {
    return NextResponse.json(
      { error: "Valid targetLanguage required (en, sv, etc.)" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, is_translation, original_book_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError || !book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isTranslation = Boolean((book as { is_translation?: boolean | null }).is_translation);
  const originalBookId = (book as { original_book_id?: string | null }).original_book_id ?? book.id;

  if (isTranslation) {
    return NextResponse.json(
      { error: "Start translation from the original book, not from a translation" },
      { status: 400 }
    );
  }

  const { data: existingTranslations } = await supabase
    .from("books")
    .select("id, language")
    .eq("original_book_id", originalBookId)
    .eq("author_id", user.id);

  const alreadyExists = (existingTranslations ?? []).some(
    (b) => String(b.language).toLowerCase() === targetLanguage
  );
  if (alreadyExists) {
    return NextResponse.json(
      { error: `A translation in ${targetLanguage} already exists for this book` },
      { status: 400 }
    );
  }

  const jobId = await enqueueTranslationJob({
    originalBookId,
    targetLanguage,
  });

  if (!jobId) {
    return NextResponse.json(
      {
        error:
          "Translation queue unavailable. Add REDIS_URL=redis://localhost:6379 to apps/web/.env.local and restart the dev server (npm run dev).",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, jobId });
}
