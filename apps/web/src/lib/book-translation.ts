import { detectLanguageFromText } from "@/lib/language-detect";
import { normalizeLanguageOrNull } from "@/lib/languages";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SupabaseLikeClient = { from(table: string): any };
/* eslint-enable @typescript-eslint/no-explicit-any */

type TranslationBookRow = {
  original_language?: string | null;
  language?: string | null;
};

type SourceLanguageOrigin = "version" | "book" | "heuristic" | null;

export type TranslationSourceContext = {
  sourceVersionId: string | null;
  sourceVersion: {
    id: string;
    book_id: string;
    language_code: string | null;
  } | null;
  sourceLanguage: string | null;
  sourceLanguageOrigin: SourceLanguageOrigin;
};

export type BookTranslationState = {
  bookId: string;
  language: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
};

const BLOCK_TYPES = new Set(["paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList", "listItem", "horizontalRule"]);

export function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if ("text" in n && typeof n.text === "string") {
    return n.text;
  }
  if ("content" in n && Array.isArray(n.content)) {
    const isBlock = typeof n.type === "string" && BLOCK_TYPES.has(n.type);
    const separator = isBlock ? "\n\n" : "";
    const inner = (n.content as unknown[]).map(extractText).filter(Boolean).join(separator);
    return isBlock ? inner + "\n\n" : inner;
  }
  return "";
}

export function extractPlainText(content: string | null | undefined): string {
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

function takeWords(text: string, remainingWords: number): { text: string; usedWords: number } {
  if (remainingWords <= 0) return { text: "", usedWords: 0 };
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { text: "", usedWords: 0 };
  const usedWords = Math.min(remainingWords, words.length);
  return {
    text: words.slice(0, usedWords).join(" ").trim(),
    usedWords,
  };
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export async function collectTranslationPreviewText(
  supabase: SupabaseLikeClient,
  sourceVersionId: string,
  wordLimit = 1000
): Promise<string> {
  const { data: chapters, error } = await supabase
    .from("chapters")
    .select("content, source_text")
    .eq("book_version_id", sourceVersionId)
    .order("order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  let remainingWords = wordLimit;
  const excerptParts: string[] = [];

  for (const chapter of chapters ?? []) {
    if (remainingWords <= 0) break;
    const plainText = extractPlainText(
      (chapter.source_text as string | null) ?? (chapter.content as string | null) ?? null
    );
    if (!plainText) continue;

    const excerpt = takeWords(plainText, remainingWords);
    if (!excerpt.text) continue;

    excerptParts.push(excerpt.text);
    remainingWords -= excerpt.usedWords;
  }

  return excerptParts.join("\n\n").trim();
}

export async function resolveTranslationSourceContext({
  supabase,
  bookId,
  book,
  requestedSourceVersionId,
}: {
  supabase: SupabaseLikeClient;
  bookId: string;
  book: TranslationBookRow;
  requestedSourceVersionId?: string | null;
}): Promise<TranslationSourceContext> {
  let sourceVersionId = requestedSourceVersionId?.trim() || null;

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

      sourceVersionId = typeof defaultVersion?.id === "string" ? defaultVersion.id : null;
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

    sourceVersionId = typeof anyVersion?.id === "string" ? anyVersion.id : null;
  }

  if (!sourceVersionId) {
    return {
      sourceVersionId: null,
      sourceVersion: null,
      sourceLanguage: null,
      sourceLanguageOrigin: null,
    };
  }

  const { data: sourceVersion, error: sourceError } = await supabase
    .from("book_versions")
    .select("id, book_id, language_code")
    .eq("id", sourceVersionId)
    .maybeSingle();

  if (sourceError || !sourceVersion || sourceVersion.book_id !== bookId) {
    return {
      sourceVersionId,
      sourceVersion: null,
      sourceLanguage: null,
      sourceLanguageOrigin: null,
    };
  }

  const versionLanguage = normalizeLanguageOrNull(sourceVersion.language_code as string | null);
  let sourceLanguage = versionLanguage;
  let sourceLanguageOrigin: SourceLanguageOrigin = sourceLanguage ? "version" : null;

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

    const sample = extractPlainText(
      (firstChapter?.source_text as string | null) ?? (firstChapter?.content as string | null) ?? null
    );
    const detected = detectLanguageFromText(sample);

    if (detected) {
      sourceLanguage = detected;
      sourceLanguageOrigin = "heuristic";
    }
  }

  if (sourceLanguage && !versionLanguage) {
    await supabase.from("book_versions").update({ language_code: sourceLanguage }).eq("id", sourceVersionId);
  }

  return {
    sourceVersionId,
    sourceVersion: {
      id: String(sourceVersion.id),
      book_id: String(sourceVersion.book_id),
      language_code:
        typeof sourceVersion.language_code === "string" ? sourceVersion.language_code : null,
    },
    sourceLanguage,
    sourceLanguageOrigin,
  };
}

export async function upsertBookTranslationState(
  supabase: SupabaseLikeClient,
  state: BookTranslationState
): Promise<void> {
  const { error } = await supabase.from("book_translations").upsert(
    {
      book_id: state.bookId,
      language: state.language,
      status: state.status,
      progress: clampProgress(state.progress),
    },
    { onConflict: "book_id,language" }
  );

  if (error) {
    throw new Error(`Failed to upsert book translation state: ${error.message}`);
  }
}

export async function deleteBookTranslationState(
  supabase: SupabaseLikeClient,
  bookId: string,
  language: string
): Promise<void> {
  const { error } = await supabase
    .from("book_translations")
    .delete()
    .eq("book_id", bookId)
    .eq("language", language);

  if (error) {
    throw new Error(`Failed to delete book translation state: ${error.message}`);
  }
}
