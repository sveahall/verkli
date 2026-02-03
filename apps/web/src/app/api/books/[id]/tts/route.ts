import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { synthesizeTextToWavBytes } from "@/lib/tts/piper";
import {
  TtsBusyError,
  TtsDisabledError,
  TtsValidationError,
  TtsSynthesisError,
} from "@/lib/tts/piper";

const AUDIOBOOKS_BUCKET = "audiobooks";
const DEFAULT_MAX_CHARS = 1000;

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

  await request.json().catch(() => ({})); // body.voice reserved for future multi-voice

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id, language")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError || !book) {
    return NextResponse.json({ ok: false, error: "Book not found" }, { status: 404 });
  }

  if (book.author_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: chapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("id, content")
    .eq("book_id", bookId)
    .order("order", { ascending: true });

  if (chaptersError || !chapters?.length) {
    return NextResponse.json(
      { ok: false, error: "No chapters found for this book" },
      { status: 400 }
    );
  }

  const maxChars = Math.min(2000, DEFAULT_MAX_CHARS);
  const text = getTextFromChapters(chapters, maxChars);
  if (!text) {
    return NextResponse.json(
      { ok: false, error: "No text content in chapters to synthesize" },
      { status: 400 }
    );
  }

  let wavBuffer: Buffer;
  try {
    wavBuffer = await synthesizeTextToWavBytes(text);
  } catch (err) {
    if (err instanceof TtsDisabledError) {
      return NextResponse.json(
        { ok: false, error: "TTS is disabled. Set TTS_ENABLED=true and configure TTS_BIN in .env.local." },
        { status: 503 }
      );
    }
    if (err instanceof TtsValidationError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 400 }
      );
    }
    if (err instanceof TtsBusyError) {
      return NextResponse.json(
        { ok: false, error: "TTS is busy. Try again shortly." },
        { status: 503 }
      );
    }
    if (err instanceof TtsSynthesisError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 502 }
      );
    }
    const msg = err instanceof Error ? err.message : "TTS synthesis failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const storagePath = `${bookId}/${Date.now()}.wav`;
  try {
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(AUDIOBOOKS_BUCKET)
      .upload(storagePath, wavBuffer, {
        contentType: "audio/wav",
        upsert: false,
      });

    if (uploadError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[tts] Storage upload failed", uploadError);
      }
      return NextResponse.json(
        {
          ok: false,
          error: `Storage upload failed. Ensure bucket "${AUDIOBOOKS_BUCKET}" exists in Supabase (Storage). ${uploadError.message}`,
        },
        { status: 502 }
      );
    }

    const { data: urlData } = admin.storage.from(AUDIOBOOKS_BUCKET).getPublicUrl(storagePath);
    const audioUrl = urlData?.publicUrl ?? null;
    if (!audioUrl) {
      return NextResponse.json(
        { ok: false, error: "Could not get audio URL" },
        { status: 502 }
      );
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
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      audioUrl: asset?.audio_url ?? audioUrl,
      assetId: asset?.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "TTS failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
