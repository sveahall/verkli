import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { createClient } from "@/lib/supabase/server";
import { AD_DRAFT_KIND, adDraftConfig, adDraftSchema, calculateAdBudget, type SavedAdDraft } from "@/lib/marketing/ad-draft";
import { AD_DRAFT_COLUMNS, adDraftFailure, checkAdDraftBook, readAdDraftBody, savedAdDraft, type AdDraftRow } from "@/lib/marketing/ad-draft-server";
const createSchema = z.object({ bookId: z.string().uuid(), draft: adDraftSchema }).strict();

export async function GET() {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;
  const client = await createClient();
  const books: Array<{ id: string; title: string | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("books").select("id, title").eq("author_id", gate.user.id).order("id").range(offset, offset + 999);
    if (error) return adDraftFailure("book list", error);
    books.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const ownedBooks = new Set(books.map(book => book.id));
  const drafts: SavedAdDraft[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("marketing_campaign_plans").select(AD_DRAFT_COLUMNS)
      .eq("author_id", gate.user.id).eq("mode", "paid").eq("status", "paused").eq("paid_config->>kind", AD_DRAFT_KIND)
      .order("id").range(offset, offset + 999);
    if (error) return adDraftFailure("draft list", error);
    for (const row of (data ?? []) as unknown as AdDraftRow[]) {
      if (!ownedBooks.has(row.book_id)) continue;
      const draft = savedAdDraft(row);
      if (!draft) return adDraftFailure("unsupported saved draft");
      drafts.push(draft);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return NextResponse.json({ books, drafts }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;
  const parsed = createSchema.safeParse(await readAdDraftBody(request));
  if (!parsed.success) return apiError("INVALID_AD_DRAFT", 400);
  const { bookId, draft } = parsed.data;
  const client = await createClient();
  const bookError = await checkAdDraftBook(client, gate.user.id, bookId);
  if (bookError) return bookError;
  const { data, error } = await client.from("marketing_campaign_plans").insert({
    book_id: bookId, author_id: gate.user.id, name: draft.name, status: "paused", template: "custom",
    channels: [], languages: [], content_types: ["text"], frequency: "1-3", weekly_schedule: {},
    start_date: draft.startDate, duration_weeks: Math.ceil(calculateAdBudget(draft).days / 7),
    mode: "paid", paid_config: adDraftConfig(draft),
  }).select(AD_DRAFT_COLUMNS).single();
  if (error || !data) return adDraftFailure("create", error);
  const saved = savedAdDraft(data as unknown as AdDraftRow);
  if (!saved) return adDraftFailure("create response");
  return NextResponse.json({ draft: saved }, { status: 201 });
}
