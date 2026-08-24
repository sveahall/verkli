import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { evaluateDemoGuard } from "@/lib/demo-guard";
import { createClient } from "@/lib/supabase/server";
import { isAudiobookEnabled } from "@/lib/flags";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { ElevenLabsTtsProvider } from "@/lib/tts/elevenlabs-tts-provider";
import { resolveNarratorVoiceId } from "@/lib/tts/tts-provider";
import {
  apiError,
  isValidUuid,
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_AUDIOBOOK_VOICE_UNCONFIGURED,
  E_BOOK_NOT_FOUND,
  E_INVALID_BOOK_ID,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { extractTextFromTiptapNode } from "@/lib/tiptap-content";

const previewLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

/** Max characters for preview to keep ElevenLabs costs tiny */
const MAX_PREVIEW_CHARS = 200;
const DEFAULT_PREVIEW_TEXT = "This is a preview of how your audiobook will sound. The full version will narrate your entire book with this voice.";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAudiobookEnabled()) {
    return apiError(E_AUDIOBOOK_FEATURE_DISABLED, 503);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

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
  const { data: book } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .eq("author_id", user.id)
    .maybeSingle();

  if (!book) return apiError(E_BOOK_NOT_FOUND, 404);

  // Parse optional text from body, fall back to first chapter snippet or default
  let previewText = DEFAULT_PREVIEW_TEXT;
  try {
    const body = await request.json();
    if (typeof body?.text === "string" && body.text.trim()) {
      previewText = body.text.trim().slice(0, MAX_PREVIEW_CHARS);
    }
  } catch {
    // No body or invalid JSON — use default
  }

  // If no custom text, try to grab first chapter content
  if (previewText === DEFAULT_PREVIEW_TEXT) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("content")
      .eq("book_version_id", (
        await supabase.from("book_versions").select("id").eq("book_id", bookId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      ).data?.id ?? "")
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
      language: "en",
      voiceId,
      modelId: modelId || "eleven_multilingual_v2",
      timeoutMs: 30_000,
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

