import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isValidUuid } from "@/lib/api-errors";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { requireProBillingForApi } from "@/lib/billing/server";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isPostDeliveryLocked } from "@/lib/marketing/post-delivery-state";
import { ElevenLabsTtsProvider } from "@/lib/tts/elevenlabs-tts-provider";
import { assertElevenLabsEnv, resolveNarratorVoiceId } from "@/lib/tts/tts-provider";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import { checkBudget, validateJobCost } from "@/lib/workers/budget";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 120;
const limiter = createPerUserRateLimiter({ name: "marketing-audio", maxPerMinute: 2 });
const inputSchema = z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isValidUuid(id)) return apiError("INVALID_POST_ID", 400);
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("INVALID_REQUEST", 400, { detail: "Save and reload your draft before generating audio." });
  const aiOff = await aiDisabledResponse(gate.user.id);
  if (aiOff) return aiOff;
  const pro = await requireProBillingForApi(gate.user.id);
  if (!pro.ok) return pro.response;
  const rate = await limiter.check(gate.user.id);
  if (!rate.allowed) return apiError("RATE_LIMIT_EXCEEDED", 429, { retryAfterSeconds: rate.retryAfterSeconds });

  const client = await createClient();
  const { data: post, error } = await client.from("marketing_posts")
    .select("id, book_id, content_type, status, caption, language, metadata, updated_at")
    .eq("id", id).eq("author_id", gate.user.id).maybeSingle();
  if (error) { console.error("[marketing audio] read:", error.message); return apiError("DATABASE_ERROR", 500); }
  if (!post) return apiError("POST_NOT_FOUND", 404);
  if (post.updated_at !== input.data.expectedUpdatedAt || post.status === "asset_pending" || post.status === "posted" || isPostDeliveryLocked(post.metadata)) {
    return apiError("POST_CHANGED", 409, { detail: "This post changed or is already generating. Reload the saved draft before trying again." });
  }
  const script = post.caption?.trim();
  if (post.content_type !== "podcast" || !script || script.length > 5000) return apiError("INVALID_AUDIO_SCRIPT", 422, { detail: "Save an audio caption of 1–5,000 characters first." });
  const voiceId = resolveNarratorVoiceId();
  try { assertElevenLabsEnv(voiceId); }
  catch { return apiError("AUDIO_UNAVAILABLE", 503, { detail: "Audio generation is not configured. Your script is saved; please contact support." }); }

  const { data: claimed, error: claimError } = await client.from("marketing_posts")
    .update({ status: "asset_pending", asset_error: null }).eq("id", id).eq("author_id", gate.user.id)
    .eq("status", post.status).eq("updated_at", post.updated_at).select("id, updated_at").maybeSingle();
  if (claimError) { console.error("[marketing audio] claim:", claimError.message); return apiError("DATABASE_ERROR", 500); }
  if (!claimed) return apiError("POST_CHANGED", 409, { detail: "Another request changed this post. Reload before generating." });

  const attemptId = randomUUID();
  let dispatched = false;
  try {
    validateJobCost({ userId: gate.user.id, pipeline: "tts", jobSize: script.length, jobId: attemptId });
    await checkBudget({ userId: gate.user.id, pipeline: "tts", units: Math.ceil(script.length / 4), jobId: attemptId });
    dispatched = true;
    const audio = await new ElevenLabsTtsProvider().synthesize(script, {
      language: post.language, voiceId: voiceId!, modelId: "", timeoutMs: 90_000,
      // This synchronous route has no ai_jobs row. A budget reservation ID
      // must not be used as the usage_events.job_id foreign key.
      meter: { userId: gate.user.id, pipeline: "marketing", bookId: post.book_id },
    });
    const extension = audio.format === "wav" ? "wav" : "mp3";
    const storagePath = `marketing/${gate.user.id}/${id}/${attemptId}.${extension}`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from(getAudiobookStorageBucket()).upload(storagePath, audio.wav, {
      contentType: extension === "wav" ? "audio/wav" : "audio/mpeg", upsert: false,
    });
    if (uploadError) throw new Error(`Audio storage failed: ${uploadError.message}`);
    const metadata = post.metadata && typeof post.metadata === "object" && !Array.isArray(post.metadata) ? post.metadata : {};
    const { data: saved, error: saveError } = await client.from("marketing_posts").update({
      status: "draft", asset_error: null,
      media_asset_url: `/api/author/marketing/posts/${id}/generate-audio`,
      metadata: { ...metadata, audioStoragePath: storagePath, audioScript: script } as Json,
    }).eq("id", id).eq("author_id", gate.user.id).eq("status", "asset_pending")
      .eq("updated_at", claimed.updated_at).select("id, updated_at").maybeSingle();
    if (saveError || !saved) throw new Error("The audio was generated but the post could not be saved.");
    return NextResponse.json({ ok: true, post: { id, updatedAt: saved.updated_at } });
  } catch (reason) {
    console.error("[marketing audio] generation:", reason instanceof Error ? reason.message : "Unknown error");
    // Once dispatched, retain the spend reservation: an uncertain provider
    // response or a storage failure must not erase a potentially billable call.
    const detail = dispatched ? "Could not finish saving the audio. Your script is still saved. Reload before trying again." : "Audio generation is temporarily unavailable. Your script is still saved. Try again later.";
    const { error: restoreError } = await client.from("marketing_posts").update({ status: "asset_failed", asset_error: detail })
      .eq("id", id).eq("author_id", gate.user.id).eq("status", "asset_pending").eq("updated_at", claimed.updated_at);
    if (restoreError) console.error("[marketing audio] failure status:", restoreError.message);
    return apiError("AUDIO_GENERATION_FAILED", dispatched ? 502 : 503, { detail });
  }
}

/** Every playback checks ownership; the stored audio never needs a public URL. */
export async function GET(_request: Request, { params }: Context) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isValidUuid(id)) return apiError("INVALID_POST_ID", 400);
  const client = await createClient();
  const { data: post, error } = await client.from("marketing_posts").select("metadata")
    .eq("id", id).eq("author_id", gate.user.id).maybeSingle();
  if (error) { console.error("[marketing audio] playback read:", error.message); return apiError("DATABASE_ERROR", 500); }
  const metadata = post?.metadata as Record<string, unknown> | null;
  const path = metadata?.audioStoragePath;
  const prefix = `marketing/${gate.user.id}/${id}/`;
  if (typeof path !== "string" || !path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(mp3|wav)$/.test(path.slice(prefix.length))) return apiError("AUDIO_NOT_FOUND", 404);
  const { data, error: signError } = await createAdminClient().storage.from(getAudiobookStorageBucket()).createSignedUrl(path, 60);
  if (signError || !data?.signedUrl) { console.error("[marketing audio] signing failed"); return apiError("AUDIO_UNAVAILABLE", 503); }
  return NextResponse.redirect(data.signedUrl, { status: 307, headers: { "Cache-Control": "private, no-store" } });
}
