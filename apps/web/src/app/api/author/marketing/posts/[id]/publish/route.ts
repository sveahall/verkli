import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isValidUuid } from "@/lib/api-errors";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { requireProBillingForApi } from "@/lib/billing/server";
import { isSocialEnabled } from "@/lib/flags";
import { createClient } from "@/lib/supabase/server";
import { checkPublishRateLimit } from "@/lib/social/rate-limit";
import { enqueueSocialPublishJob } from "@/lib/social-publish-queue";
import { isCampaignPublisherReady } from "@/lib/marketing/publish-readiness";
import { assertLocalCampaignSimulation, changePostDelivery, DeliveryError } from "@/lib/marketing/post-delivery";
import { getPostDelivery } from "@/lib/marketing/post-delivery-state";

export const runtime = "nodejs";
const schema = z.object({ action: z.enum(["schedule", "cancel", "retry", "recover"]), expectedUpdatedAt: z.string().datetime({ offset: true }), scheduledFor: z.string().datetime({ offset: true }).optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const simulated = process.env.SOCIAL_MOCK_MODE === "true";
  try { assertLocalCampaignSimulation(simulated); }
  catch (error) {
    console.error("[campaign delivery] simulation admission blocked: environment is not isolated");
    return apiError("CAMPAIGN_SIMULATION_ONLY", 503, { detail: (error as Error).message });
  }
  const { id } = await params;
  if (!isValidUuid(id)) return apiError("INVALID_POST_ID", 400);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_DELIVERY_REQUEST", 400, { detail: "Reload the post and choose a valid publishing time." });
  const { action } = parsed.data;
  const localOnlyAction = action === "cancel" || action === "recover";
  const gate = localOnlyAction ? await requireAuthorRoleForApi() : await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;
  // Stopping an admitted job must remain possible after billing, a feature flag,
  // connection or worker health changes. Admission checks apply to sends only.
  if (!localOnlyAction) {
    if (!isSocialEnabled()) return apiError("SOCIAL_FEATURE_DISABLED", 403, { detail: "Connected publishing is unavailable. You can still copy and share manually." });
    const pro = await requireProBillingForApi(gate.user.id);
    if (!pro.ok) return pro.response;
    const limit = await checkPublishRateLimit(gate.user.id);
    if (!limit.allowed) return apiError("RATE_LIMIT_EXCEEDED", 429, { retryAfterSeconds: limit.retryAfterSeconds });
    if (!await isCampaignPublisherReady()) {
      console.error("[campaign delivery] admission blocked: no fresh social publishing consumer");
      return apiError("PUBLISHER_UNAVAILABLE", 503, { detail: "Scheduled publishing is temporarily unavailable. No delivery was scheduled. Try again later or share manually." });
    }
  }
  try {
    const post = await changePostDelivery({
      client: await createClient(), postId: id, userId: gate.user.id, ...parsed.data,
      simulated,
      enqueue: async job => enqueueSocialPublishJob({ ...job, campaignId: "", bookId: "", platforms: ["x"] }),
    });
    return NextResponse.json({ delivery: getPostDelivery(post.metadata), updatedAt: post.updated_at, status: post.status }, { status: localOnlyAction ? 200 : 202 });
  } catch (error) {
    console.error("[campaign delivery] request failed:", error instanceof Error ? error.message : "Unknown error");
    return apiError("CAMPAIGN_DELIVERY_FAILED", error instanceof DeliveryError ? error.status : 500, {
      detail: error instanceof DeliveryError ? error.message : "Could not update campaign delivery. Refresh before trying again.",
    });
  }
}
