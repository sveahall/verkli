import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { evaluateDemoGuard } from "@/lib/demo-guard";
import { createClient } from "@/lib/supabase/server";
import { isAudiobookEnabled } from "@/lib/flags";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { ElevenLabsTtsProvider } from "@/lib/tts/elevenlabs-tts-provider";
import { resolveNarratorVoiceId } from "@/lib/tts/tts-provider";
import { extractAgentChapterText } from "@/lib/ai/agent-actions";
import { buildPronunciationPreview, pronunciationRuleSchema } from "@/lib/ai/pronunciation-preview";
import {
  apiError,
  isValidUuid,
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_AUDIOBOOK_VOICE_UNCONFIGURED,
  E_BOOK_NOT_FOUND,
  E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE,
  E_INVALID_BOOK_ID,
  E_INVALID_BOOK_VERSION,
  E_INVALID_CHAPTER_ID,
  E_RATE_LIMIT_EXCEEDED,
  E_SOURCE_LANGUAGE_MISSING,
  E_CHAPTER_NEEDS_CONTENT,
  E_TTS_PREVIEW_INVALID_INPUT,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { extractTextFromTiptapNode } from "@/lib/tiptap-content";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";

const previewLimiter = createPerUserRateLimiter({ name: "books-audiobook-preview", maxPerMinute: 5 });

/** Max characters for preview to keep ElevenLabs costs tiny */
const MAX_PREVIEW_CHARS = 200;
const DEFAULT_PREVIEW_TEXT = "This is a preview of how your audiobook will sound. The full version will narrate your entire book with this voice.";
const pronunciationPreviewSchema = z.object({
  chapterId: z.string().uuid(),
  pronunciation: pronunciationRuleSchema,
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAudiobookEnabled()) {
    return apiError(E_AUDIOBOOK_FEATURE_DISABLED, 503);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  // Account master AI switch. Server-side, so turning AI off is a real

  // setting and not just a hidden button.

  const aiOff = await aiDisabledResponse(user.id);

  if (aiOff) return aiOff;

  const rl = await previewLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: rl.retryAfterSeconds });
  }

  // Demo-mode short-circuit (see lib/demo-guard).
  const guard = await evaluateDemoGuard(createClient, user.id, "audiobook/preview");
  if (guard.shouldSkip && guard.response) return guard.response;

  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  // Verify book ownership
  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, language, original_language")
    .eq("id", bookId)
    .eq("author_id", user.id)
    .maybeSingle();

  if (bookError || !book) {
    console.warn("[audiobook preview] book unavailable", { bookId, reason: bookError?.message ?? "not found for this author" });
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Parse optional text from body, fall back to first chapter snippet or default
  let previewText = DEFAULT_PREVIEW_TEXT;
  let previewLanguage = book.original_language || book.language || "en";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // No body or invalid JSON — use default
  }
  const scopedPronunciation = Boolean(body && typeof body === "object" && ("pronunciation" in body || "chapterId" in body));
  const scopedEdition = Boolean(body && typeof body === "object" && "versionId" in body);
  if (scopedPronunciation) {
    const parsed = pronunciationPreviewSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[audiobook preview] invalid pronunciation request", { bookId });
      return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, { detail: "Choose a chapter and provide a pronunciation word, spoken form and sample within the preview limits." });
    }
    const { chapterId, pronunciation } = parsed.data;
    const { data: chapter, error: chapterError } = await supabase.from("chapters")
      .select("id, book_id, book_version_id, content")
      .eq("id", chapterId).eq("book_id", bookId).maybeSingle();
    if (chapterError || !chapter || chapter.book_id !== bookId) {
      console.warn("[audiobook preview] chapter unavailable", { bookId, chapterId, reason: chapterError?.message ?? "not found for this book" });
      return apiError(E_INVALID_CHAPTER_ID, 404, { detail: "The selected chapter is not available in this book. Reopen it before previewing." });
    }
    const { data: version, error: versionError } = await supabase.from("book_versions")
      .select("id, book_id, language_code")
      .eq("id", chapter.book_version_id).eq("book_id", bookId).maybeSingle();
    if (versionError || !version || version.book_id !== bookId) {
      console.warn("[audiobook preview] chapter edition unavailable", { bookId, chapterId, reason: versionError?.message ?? "not found for this book" });
      return apiError(E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE, 404, { detail: "The chapter's edition is not available in this book." });
    }
    if (!version.language_code?.trim()) {
      console.warn("[audiobook preview] chapter edition has no language", { bookId, chapterId });
      return apiError(E_SOURCE_LANGUAGE_MISSING, 400, { detail: "Set a language for this edition before previewing pronunciation." });
    }
    if (!extractAgentChapterText(chapter.content).includes(pronunciation.word)) {
      console.warn("[audiobook preview] pronunciation target is stale", { bookId, chapterId });
      return apiError(E_TTS_PREVIEW_INVALID_INPUT, 409, { detail: "The pronunciation word is no longer in the saved chapter. Save the chapter and ask for a new suggestion." });
    }
    try {
      previewText = buildPronunciationPreview(pronunciation);
    } catch {
      console.warn("[audiobook preview] pronunciation sample is invalid", { bookId, chapterId });
      return apiError(E_TTS_PREVIEW_INVALID_INPUT, 400, { detail: "The preview sample must contain the pronunciation word and a spoken form of at most 200 characters." });
    }
    previewLanguage = version.language_code;
  } else if (scopedEdition) {
    const versionId = (body as { versionId: unknown }).versionId;
    if (typeof versionId !== "string" || !isValidUuid(versionId)) {
      console.warn("[audiobook preview] invalid edition request", { bookId });
      return apiError(E_INVALID_BOOK_VERSION, 400, { detail: "Choose a valid edition before previewing its voice." });
    }
    const { data: version, error: versionError } = await supabase.from("book_versions")
      .select("id, book_id, language_code")
      .eq("id", versionId).eq("book_id", bookId).maybeSingle();
    if (versionError || !version || version.book_id !== bookId) {
      console.warn("[audiobook preview] selected edition unavailable", { bookId, versionId, reason: versionError?.message ?? "not found for this book" });
      return apiError(E_BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE, 404, { detail: "The selected edition is not available in this book. Reopen it before previewing." });
    }
    if (!version.language_code?.trim()) {
      console.warn("[audiobook preview] selected edition has no language", { bookId, versionId });
      return apiError(E_SOURCE_LANGUAGE_MISSING, 400, { detail: "Set a language for this edition before previewing its voice." });
    }
    const { data: chapters, error: chaptersError } = await supabase.from("chapters")
      .select("content").eq("book_id", bookId).eq("book_version_id", versionId)
      .is("deleted_at", null).order("order", { ascending: true });
    if (chaptersError) {
      console.error("[audiobook preview] selected edition chapters unavailable", { bookId, versionId, reason: chaptersError.message });
      return apiError(E_VALIDATION_FAILED, 500, { detail: "Could not load this edition's chapters. Please try again." });
    }
    const text = chapters?.map((chapter) => extractAgentChapterText(chapter.content).trim()).find(Boolean);
    if (!text) {
      console.warn("[audiobook preview] selected edition has no text", { bookId, versionId });
      return apiError(E_CHAPTER_NEEDS_CONTENT, 400, { detail: "Add text to a chapter in this edition before previewing its voice." });
    }
    previewText = text.slice(0, MAX_PREVIEW_CHARS);
    previewLanguage = version.language_code.trim();
  } else if (body && typeof body === "object" && "text" in body && typeof body.text === "string" && body.text.trim()) {
    previewText = body.text.trim().slice(0, MAX_PREVIEW_CHARS);
  }

  // If no custom text, try to grab first chapter content
  if (!scopedPronunciation && !scopedEdition && previewText === DEFAULT_PREVIEW_TEXT) {
    const { data: version } = await supabase.from("book_versions")
      .select("id, language_code").eq("book_id", bookId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    previewLanguage = version?.language_code || previewLanguage;
    const { data: chapters } = await supabase
      .from("chapters")
      .select("content")
      .eq("book_version_id", version?.id ?? "")
      .order("order", { ascending: true })
      .limit(1);

    if (chapters?.[0]?.content) {
      const raw = typeof chapters[0].content === "string" ? chapters[0].content : "";
      // Extract plain text from TipTap JSON
      try {
        const parsed = JSON.parse(raw);
        const text = extractTextFromTiptapNode(parsed);
        if (text.trim().length > 20) {
          previewText = text.trim().slice(0, MAX_PREVIEW_CHARS);
        }
      } catch {
        if (raw.trim().length > 20) {
          previewText = raw.trim().slice(0, MAX_PREVIEW_CHARS);
        }
      }
    }
  }

  try {
    // Same resolver the generate route and worker use, so a deployment with only
    // TTS_VOICE_ID set previews in the voice it will actually narrate in.
    //
    // Refuse instead of falling back. The old `voiceId || "Rachel"` did not crash —
    // "Rachel" is a real ElevenLabs voice — so an unconfigured deployment quietly
    // previewed every book in the wrong narrator and nobody found out. A 503 is the
    // better failure mode.
    const voiceId = resolveNarratorVoiceId();
    if (!voiceId) {
      console.error(
        "[audiobook preview] no narrator voice configured. " +
          "Set ELEVENLABS_VOICE_ID (or TTS_VOICE_ID) to an ElevenLabs voice id."
      );
      return apiError(E_AUDIOBOOK_VOICE_UNCONFIGURED, 503, {
        detail: "Narrator voice is not configured for this deployment.",
      });
    }

    const tts = new ElevenLabsTtsProvider();
    const modelId = (process.env.ELEVENLABS_MODEL_ID ?? "").trim();

    const result = await tts.synthesize(previewText, {
      language: previewLanguage,
      voiceId,
      modelId: modelId || "eleven_multilingual_v2",
      timeoutMs: 30_000,
      meter: { userId: user.id, pipeline: "tts", bookId },
    });

    // Return audio directly as a binary response
    const contentType = result.format === "mp3" ? "audio/mpeg" : "audio/wav";
    return new NextResponse(new Uint8Array(result.wav), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(result.wav.byteLength),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[audiobook preview] TTS failed:", err instanceof Error ? err.message : String(err));
    return apiError(E_VALIDATION_FAILED, 502, { detail: "Voice preview unavailable. Check TTS configuration." });
  }
}
