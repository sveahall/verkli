import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { assertBookOwned } from "@/lib/marketing/assert-book-owner";
import { videoGenerateBodySchema } from "@/lib/marketing/schemas";
import { evaluateDemoGuard } from "@/lib/demo-guard";
import { uploadTrailerAndGetPublicUrl } from "@/lib/marketing/trailer-storage";
import { generateImageToVideo } from "@/lib/higgsfield";
import { validateProviderImageUrl } from "@/lib/security/url-allowlist";
import { reserveVideoBudget, refundVideoBudget } from "@/lib/marketing/video-budget";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { requireProBillingForApi } from "@/lib/billing/server";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_JSON,
  E_RATE_LIMIT_EXCEEDED,
  E_TEXT_TO_VIDEO_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 180;
const TRAILER_DOWNLOAD_TIMEOUT_MS = 20_000;

/** Estimated cost per 5s Higgsfield trailer (USD). */
const ESTIMATED_COST_USD = 0.15;

// Spend gate. `requireAuthorAndMarketingEnabled` only checks the marketing flag
// and the author role, so without these two lines any author could loop this
// route and mint Higgsfield jobs at ESTIMATED_COST_USD each. Matches the limits
// the sibling spenders already carry: books/[id]/trailer/build (1/min) and
// ai/text-to-video (5/min), both also behind requireProBillingForApi.
const rateLimiter = createPerUserRateLimiter({
  name: "marketing-video-generate",
  maxPerMinute: 1,
});

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

  const supabase = await createClient();

  // Demo-mode short-circuit — keeps the demo profile from burning Higgsfield
  // credits if anything stray fires this endpoint mid-pitch.
  //
  // This runs BEFORE the rate limit and the Pro gate, matching
  // books/[id]/trailer/build. The `{ok:true, demo_mode:true}` body is
  // contractual (see lib/demo-guard), so the demo account has to reach it: put
  // the billing gate first and a demo profile without active author Pro gets a
  // 403 instead, having spent its 1/min token on the way.
  const guard = await evaluateDemoGuard(
    () => Promise.resolve(supabase),
    gate.user.id,
    "marketing/video/generate"
  );
  if (guard.shouldSkip && guard.response) return guard.response;

  const rl = await rateLimiter.check(gate.user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const proGate = await requireProBillingForApi(gate.user.id);
  if (!proGate.ok) return proGate.response;

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

  const { bookId, prompt, imageUrl, audio, metadata: requestMetadata } = parsed.data;
  const includeAudio = audio ?? true;
  const admin = createAdminClient();

  const ownership = await assertBookOwned(supabase, gate.user.id, bookId);
  if (!ownership.ok) return ownership.response;

  // SSRF guard: the client-supplied imageUrl is fetched server-side by the
  // Higgsfield provider, so enforce the same host allowlist the other two
  // image->video routes (ai/text-to-video, trailer/build) already apply.
  const urlCheck = validateProviderImageUrl(imageUrl);
  if (!urlCheck.ok) {
    return apiError(E_VALIDATION_FAILED, 400, { detail: "imageUrl host not allowed" });
  }
  const safeImageUrl = urlCheck.url.toString();

  // One image->video generation, so one unit. Reserved before the provider
  // call and refunded below if it produces nothing.
  const budget = await reserveVideoBudget({ userId: gate.user.id, units: 1 });
  if (!budget.ok) return budget.response;

  const inputJson = {
    model: "dop-standard",
    prompt,
    imageUrl: safeImageUrl,
    audio: includeAudio,
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
    const { requestId, videoUrl } = await generateImageToVideo({
      prompt,
      imageUrl: safeImageUrl,
      includeAudio,
    });

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
    await refundVideoBudget(budget.reservation);

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
