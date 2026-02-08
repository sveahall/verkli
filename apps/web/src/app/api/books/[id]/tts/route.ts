import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { getTtsStorageBucket } from "@/lib/tts/storage";
import { synthesizeTextToWavBytes } from "@/lib/tts/piper";
import {
  TtsBusyError,
  TtsDisabledError,
  TtsValidationError,
  TtsSynthesisError,
} from "@/lib/tts/piper";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  apiError,
  E_TTS_ENV_CONFIG_ERROR,
  E_BOOK_NOT_FOUND,
  E_FORBIDDEN,
  E_NO_CHAPTERS,
  E_NO_TEXT_IN_CHAPTERS,
  E_TTS_DISABLED,
  E_TTS_BUSY,
  E_TTS_SYNTHESIS_FAILED,
  E_TTS_UNEXPECTED_ERROR,
  E_BUCKET_NOT_FOUND,
  E_AUDIO_URL_GENERATION_FAILED,
  E_DATABASE_ERROR,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const DEFAULT_MAX_CHARS = 1000;

function maskSupabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.slice(0, 8)}…${u.hostname.slice(-4)}`;
  } catch {
    return "(invalid url)";
  }
}

function ensureTtsStorageEnv(): { url: string; error?: string } {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url) {
    return {
      url: "",
      error:
        "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is missing. Set one of them in .env.local for TTS storage.",
    };
  }
  if (!key) {
    return {
      url,
      error:
        "SUPABASE_SERVICE_ROLE_KEY is missing. Set it in .env.local (Settings → API in Supabase dashboard).",
    };
  }
  return { url };
}

async function ensureBucketExists(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (!listError && buckets?.some((b) => b.name === bucket)) {
    return { ok: true };
  }
  if (listError) {
    const msg = String(listError.message ?? listError);
    if (msg.toLowerCase().includes("bucket") && msg.toLowerCase().includes("not found")) {
      return { ok: false, error: "Bucket not found" };
    }
  }
  const testPath = `_tts_preflight_${Date.now()}.tmp`;
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(testPath, new Uint8Array(0), { contentType: "application/octet-stream", upsert: true });
  if (uploadError) {
    const msg = String(uploadError.message ?? uploadError);
    if (
      (uploadError as { statusCode?: string })?.statusCode === "404" ||
      msg.toLowerCase().includes("bucket") ||
      msg.toLowerCase().includes("not found")
    ) {
      return { ok: false, error: "Bucket not found" };
    }
    await admin.storage.from(bucket).remove([testPath]).catch(() => {});
    return { ok: false, error: msg };
  }
  await admin.storage.from(bucket).remove([testPath]).catch(() => {});
  return { ok: true };
}

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

function getTextFromChapters(chapters: { content: string | null }[], maxChars: number): string {
  let out = "";
  for (const ch of chapters) {
    if (!ch.content) continue;
    try {
      const parsed = JSON.parse(ch.content);
      out += extractText(parsed);
      if (out.length >= maxChars) break;
    } catch {
      out += String(ch.content).trim();
      if (out.length >= maxChars) break;
    }
  }
  return out.trim().slice(0, maxChars);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id: bookId } = await params;
  const requestId = `tts-${bookId}-${Date.now()}`;

  const envCheck = ensureTtsStorageEnv();
  if (envCheck.error) {
    console.error("[tts] Preflight env failed", { requestId, error: envCheck.error });
    return apiError(E_TTS_ENV_CONFIG_ERROR, 500);
  }

  const bucket = getTtsStorageBucket();

  await request.json().catch(() => ({})); // body.voice reserved for future multi-voice

  // SECURITY: Require author role for TTS generation
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError || !book) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  if (book.author_id !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  const { data: chapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("id, content")
    .eq("book_id", bookId)
    .order("order", { ascending: true });

  if (chaptersError || !chapters?.length) {
    return apiError(E_NO_CHAPTERS, 400);
  }

  const maxChars = Math.min(2000, DEFAULT_MAX_CHARS);
  const text = getTextFromChapters(chapters, maxChars);
  if (!text) {
    return apiError(E_NO_TEXT_IN_CHAPTERS, 400);
  }

  let wavBuffer: Buffer;
  try {
    wavBuffer = await synthesizeTextToWavBytes(text);
  } catch (err) {
    if (err instanceof TtsDisabledError) {
      return apiError(E_TTS_DISABLED, 503);
    }
    if (err instanceof TtsValidationError) {
      return apiError(E_VALIDATION_FAILED, 400, { detail: err.message });
    }
    if (err instanceof TtsBusyError) {
      return apiError(E_TTS_BUSY, 503);
    }
    if (err instanceof TtsSynthesisError) {
      return apiError(E_TTS_SYNTHESIS_FAILED, 502);
    }
    console.error("[tts] Unexpected synthesis error", { requestId, error: err instanceof Error ? err.message : String(err) });
    return apiError(E_TTS_SYNTHESIS_FAILED, 502);
  }

  const storagePath = `${bookId}/${Date.now()}.wav`;
  const contentType = "audio/wav";
  const fileSizeBytes = wavBuffer.length;
  console.log("[tts] Upload preflight", {
    requestId,
    bucket,
    path: storagePath,
    contentType,
    fileSizeBytes,
    supabaseUrl: maskSupabaseUrl(envCheck.url),
  });

  try {
    const admin = createAdminClient();
    const bucketCheck = await ensureBucketExists(admin, bucket);
    if (!bucketCheck.ok) {
      console.error("[tts] Bucket check failed", {
        requestId,
        bucket,
        error: bucketCheck.error,
      });
      return apiError(E_BUCKET_NOT_FOUND, 500, { bucket });
    }

    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(storagePath, wavBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      const errMsg = String(uploadError.message ?? uploadError);
      const isBucketNotFound =
        (uploadError as { statusCode?: string })?.statusCode === "404" ||
        errMsg.toLowerCase().includes("bucket") ||
        errMsg.toLowerCase().includes("not found");
      console.error("[tts] Storage upload failed", {
        requestId,
        bucket,
        path: storagePath,
        error: errMsg,
      });
      if (isBucketNotFound) {
        return apiError(E_BUCKET_NOT_FOUND, 500, { bucket });
      }
      return apiError(E_DATABASE_ERROR, 500);
    }

    const { data: urlData } = admin.storage.from(bucket).getPublicUrl(storagePath);
    const audioUrl = urlData?.publicUrl ?? null;
    if (!audioUrl) {
      return apiError(E_AUDIO_URL_GENERATION_FAILED, 502);
    }

    const language = (book.language ?? "en").slice(0, 10);
    const { data: asset, error: insertError } = await supabase
      .from("audiobook_assets")
      .insert({
        book_id: bookId,
        language,
        status: "generated",
        audio_url: audioUrl,
      })
      .select("id, audio_url")
      .single();

    if (insertError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[tts] audiobook_assets insert failed", insertError);
      }
      console.error("[tts] audiobook_assets insert failed", { message: insertError.message });
      return apiError(E_DATABASE_ERROR, 500);
    }

    return NextResponse.json({
      ok: true,
      audioUrl: asset?.audio_url ?? audioUrl,
      assetId: asset?.id,
    });
  } catch (err) {
    console.error("[tts] Unexpected error", { requestId, error: err instanceof Error ? err.message : String(err) });
    return apiError(E_TTS_UNEXPECTED_ERROR, 500);
  }
}
