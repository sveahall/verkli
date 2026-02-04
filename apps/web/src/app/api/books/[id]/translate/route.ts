import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueTranslationJob } from "@/lib/translation-queue";
import { detectLanguageFromText } from "@/lib/language-detect";
import { isSupportedLanguage, normalizeLanguageOrNull } from "@/lib/languages";
import { assertPublicEnv } from "@/lib/env";

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if ("content" in node && Array.isArray((node as { content?: unknown[] }).content)) {
    return (node as { content: unknown[] }).content.map(extractText).join("");
  }
  return "";
}

function extractPlainText(content: string | null | undefined): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || trimmed.startsWith("[")) {
    try {
      return extractText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id: bookId } = await params;

  const body = await request.json().catch(() => ({}));
  const rawTarget =
    typeof body?.targetLanguage === "string"
      ? body.targetLanguage
      : typeof body?.targetLang === "string"
        ? body.targetLang
        : "";
  const targetLanguage = rawTarget.trim().toLowerCase();

  if (!targetLanguage || !isSupportedLanguage(targetLanguage)) {
    return NextResponse.json(
      { ok: false, error: "Valid target language required (en, sv, etc.)" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, original_language, language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError || !book) {
    return NextResponse.json({ ok: false, error: "Book not found" }, { status: 404 });
  }

  if (book.author_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const bodySourceVersionId =
    body?.sourceVersionId != null && String(body.sourceVersionId).trim() !== ""
      ? String(body.sourceVersionId).trim()
      : null;
  const overwrite = Boolean(body?.overwrite);

  let sourceVersionId = bodySourceVersionId;
  if (!sourceVersionId) {
    const preferredLanguage =
      normalizeLanguageOrNull(book.original_language) ?? normalizeLanguageOrNull(book.language);
    if (preferredLanguage) {
      const { data: defaultVersion } = await supabase
        .from("book_versions")
        .select("id, language_code")
        .eq("book_id", bookId)
        .eq("language_code", preferredLanguage)
        .maybeSingle();
      sourceVersionId = defaultVersion?.id ?? null;
    }
  }

  if (!sourceVersionId) {
    const { data: anyVersion } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", bookId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    sourceVersionId = anyVersion?.id ?? null;
  }

  if (!sourceVersionId) {
    return NextResponse.json({ ok: false, error: "No source version found" }, { status: 400 });
  }

  const { data: sourceVersion, error: sourceError } = await supabase
    .from("book_versions")
    .select("id, book_id, language_code")
    .eq("id", sourceVersionId)
    .maybeSingle();

  if (sourceError || !sourceVersion || sourceVersion.book_id !== bookId) {
    return NextResponse.json({ ok: false, error: "Invalid source version" }, { status: 400 });
  }

  const versionLanguage = normalizeLanguageOrNull(sourceVersion.language_code);
  let sourceLanguage = versionLanguage;
  let sourceLanguageOrigin: "version" | "book" | "heuristic" | null = sourceLanguage ? "version" : null;

  if (!sourceLanguage) {
    const bookLanguage = normalizeLanguageOrNull(book.original_language) ?? normalizeLanguageOrNull(book.language);
    if (bookLanguage) {
      sourceLanguage = bookLanguage;
      sourceLanguageOrigin = "book";
    }
  }

  if (!sourceLanguage) {
    const { data: firstChapter } = await supabase
      .from("chapters")
      .select("content, source_text")
      .eq("book_version_id", sourceVersionId)
      .order("order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const sample = extractPlainText((firstChapter?.source_text as string | null) ?? firstChapter?.content ?? null);
    const detected = detectLanguageFromText(sample);
    if (detected) {
      sourceLanguage = detected;
      sourceLanguageOrigin = "heuristic";
    }
  }

  if (sourceLanguage && !versionLanguage) {
    await supabase.from("book_versions").update({ language_code: sourceLanguage }).eq("id", sourceVersionId);
  }

  console.log("[translate] request", {
    bookId,
    sourceVersionId,
    sourceLanguage: sourceLanguage ?? null,
    targetLanguage,
    userId: user.id,
    sourceLanguageOrigin,
  });

  if (!sourceLanguage) {
    console.warn("[translate] source language missing", {
      bookId,
      sourceVersionId,
      targetLanguage,
      userId: user.id,
    });
    return NextResponse.json(
      { ok: false, error: "Source language missing, please set language for this version", code: "SOURCE_LANGUAGE_MISSING" },
      { status: 422 }
    );
  }

  if (sourceLanguage === targetLanguage) {
    return NextResponse.json(
      { ok: false, error: "Target language must be different from source version language" },
      { status: 400 }
    );
  }

  const { data: existingVersion } = await supabase
    .from("book_versions")
    .select("id, status")
    .eq("book_id", bookId)
    .eq("language_code", targetLanguage)
    .maybeSingle();

  if (existingVersion && !overwrite) {
    return NextResponse.json(
      {
        ok: false,
        error: `A version in ${targetLanguage} already exists for this book`,
        existingVersionId: existingVersion.id,
      },
      { status: 400 }
    );
  }

  const targetVersionId = existingVersion?.id ?? null;

  const jobId = await enqueueTranslationJob({
    bookId,
    sourceVersionId,
    targetLanguage,
    targetVersionId,
    overwrite,
  });

  if (!jobId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Translation queue unavailable. Add REDIS_URL=redis://localhost:6379 to apps/web/.env.local and restart the dev server (npm run dev).",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, jobId, targetVersionId });
}
