import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isValidUuid } from "@/lib/api-errors";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { createClient } from "@/lib/supabase/server";
import { AD_DRAFT_KIND, adDraftConfig, adDraftSchema, calculateAdBudget } from "@/lib/marketing/ad-draft";
import { AD_DRAFT_COLUMNS, adDraftFailure, checkAdDraftBook, readAdDraftBody, savedAdDraft, type AdDraftRow } from "@/lib/marketing/ad-draft-server";
const updateSchema = z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }), draft: adDraftSchema }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isValidUuid(id)) return apiError("INVALID_AD_DRAFT", 400);
  const parsed = updateSchema.safeParse(await readAdDraftBody(request));
  if (!parsed.success) return apiError("INVALID_AD_DRAFT", 400);
  const client = await createClient();
  const { data: current, error: readError } = await client.from("marketing_campaign_plans").select(AD_DRAFT_COLUMNS)
    .eq("id", id).eq("author_id", gate.user.id).eq("mode", "paid").eq("status", "paused").eq("paid_config->>kind", AD_DRAFT_KIND).maybeSingle();
  if (readError) return adDraftFailure("update lookup", readError);
  if (!current) return apiError("AD_DRAFT_NOT_FOUND", 404);
  const saved = savedAdDraft(current as unknown as AdDraftRow);
  if (!saved) return apiError("AD_DRAFT_CHANGED", 409);
  const bookError = await checkAdDraftBook(client, gate.user.id, saved.bookId);
  if (bookError) return bookError;
  const { draft, expectedUpdatedAt } = parsed.data;
  const { data, error } = await client.from("marketing_campaign_plans").update({
    name: draft.name, paid_config: adDraftConfig(draft), start_date: draft.startDate, duration_weeks: Math.ceil(calculateAdBudget(draft).days / 7),
  }).eq("id", id).eq("author_id", gate.user.id).eq("book_id", saved.bookId).eq("mode", "paid").eq("status", "paused")
    .eq("paid_config->>kind", AD_DRAFT_KIND).eq("paid_config->>version", "1").eq("updated_at", expectedUpdatedAt)
    .select(AD_DRAFT_COLUMNS).maybeSingle();
  if (error) return adDraftFailure("update", error);
  if (!data) return apiError("AD_DRAFT_CHANGED", 409);
  const result = savedAdDraft(data as unknown as AdDraftRow);
  if (!result) return adDraftFailure("update response");
  return NextResponse.json({ draft: result });
}
