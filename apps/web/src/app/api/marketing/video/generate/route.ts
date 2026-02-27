import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { assertBookOwned } from "@/lib/marketing/assert-book-owner";
import { videoGenerateBodySchema } from "@/lib/marketing/schemas";
import { uploadTrailerAndGetPublicUrl } from "@/lib/marketing/trailer-storage";
import { generateImageToVideo } from "@/lib/higgsfield";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_JSON,
  E_TEXT_TO_VIDEO_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 180;
const TRAILER_DOWNLOAD_TIMEOUT_MS = 20_000;

/** Estimated cost per 5s Higgsfield trailer (USD). */
const ESTIMATED_COST_USD = 0.15;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `[marketing video generate] trailer download timed out after ${timeoutMs}ms.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = videoGenerateBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { bookId, prompt, imageUrl, metadata: requestMetadata } = parsed.data;
  const supabase = await createClient();
  const admin = createAdminClient();

  const ownership = await assertBookOwned(supabase, gate.user.id, bookId);
  if (!ownership.ok) return ownership.response;

  const inputJson = {
    model: "dop-standard",
    prompt,
    imageUrl,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("media_assets")
    .insert({
      user_id: gate.user.id,
      book_id: bookId,
      type: "video",
      status: "generating",
      provider: "higgsfield",
      input_json: inputJson,
      duration_seconds: 5,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("[marketing video generate] insert media_asset failed:", insertError?.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  try {
    const startMs = Date.now();
    const { requestId, videoUrl } = await generateImageToVideo({ prompt, imageUrl });

    const res = await fetchWithTimeout(videoUrl, TRAILER_DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`Failed to fetch trailer from provider: ${res.status}`);
    }
    const videoBuffer = await res.arrayBuffer();

    const uploadResult = await uploadTrailerAndGetPublicUrl(
      admin,
      gate.user.id,
      inserted.id,
      videoBuffer,
      res.headers.get("content-type") || "video/mp4"
    );

    if ("error" in uploadResult) {
      throw new Error(`Trailer storage upload failed: ${uploadResult.error}`);
    }

    const generationTimeMs = Date.now() - startMs;
    const metadata = {
      ...(requestMetadata?.scenes != null && { scenes: requestMetadata.scenes }),
      ...(requestMetadata?.caption != null && { caption: requestMetadata.caption }),
      ...(requestMetadata?.hashtags != null && { hashtags: requestMetadata.hashtags }),
      generation_time_ms: generationTimeMs,
    };

    const { data: updatedReady, error: updateReadyError } = await supabase
      .from("media_assets")
      .update({
        status: "ready",
        provider_request_id: requestId,
        output_url: uploadResult.publicUrl,
        metadata,
        estimated_cost_usd: ESTIMATED_COST_USD,
        error: null,
      })
      .eq("id", inserted.id)
      .eq("user_id", gate.user.id)
      .select("id")
      .single();

    if (updateReadyError || !updatedReady?.id) {
      console.error(
        "[marketing video generate] mark ready failed:",
        updateReadyError?.message ?? "no row updated"
      );
      return apiError(E_DATABASE_ERROR, 500);
    }

    return NextResponse.json({ assetId: inserted.id, url: uploadResult.publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Higgsfield error";

    const { data: updatedFailed, error: updateFailedError } = await supabase
      .from("media_assets")
      .update({
        status: "failed",
        error: message,
      })
      .eq("id", inserted.id)
      .eq("user_id", gate.user.id)
      .select("id")
      .single();

    if (updateFailedError || !updatedFailed?.id) {
      console.error(
        "[marketing video generate] mark failed update error:",
        updateFailedError?.message ?? "no row updated"
      );
    }

    console.error("[marketing video generate] higgsfield generation failed:", message);
    return apiError(E_TEXT_TO_VIDEO_FAILED, 502);
  }
}
