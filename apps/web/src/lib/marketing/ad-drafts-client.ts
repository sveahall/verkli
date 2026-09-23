import { z } from "zod";
import { savedAdDraftSchema, type AdDraft, type SavedAdDraft } from "./ad-draft";
export type AdDraftList = { books: Array<{ id: string; title: string | null }>; drafts: SavedAdDraft[] };
export interface AdDraftsClient {
  list(): Promise<AdDraftList>;
  save(bookId: string, draft: AdDraft, current: SavedAdDraft | null): Promise<SavedAdDraft>;
}
const messages: Record<string, string> = {
  AD_DRAFT_CHANGED: "This draft changed elsewhere. Your text is still here. Reload the saved list and open the latest draft before saving again.",
  INVALID_AD_DRAFT: "Check the required fields, HTTPS link, amounts and calendar dates.",
  MARKETING_FEATURE_DISABLED: "Marketing is not enabled in this environment.",
  BOOK_NOT_FOUND: "The selected book is unavailable or no longer belongs to your account.",
  AD_DRAFT_NOT_FOUND: "This saved draft is no longer available. Your text is still here.",
  UNAUTHORIZED: "Sign in again before managing ad drafts.",
  FORBIDDEN: "An author account is required to manage ad drafts.",
};
const uncertain = "The operation could not be confirmed. Your text is still here. Reload saved drafts before retrying a save.";
async function request(url: string, options?: RequestInit) {
  let response: Response;
  try { response = await fetch(url, { ...options, credentials: "same-origin", cache: "no-store" }); } catch { throw new Error(uncertain); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" && Object.prototype.hasOwnProperty.call(messages, data.error) ? messages[data.error] : uncertain);
  return data;
}
export const adDraftsClient: AdDraftsClient = {
  async list() {
    const parsed = z.object({ books: z.array(z.object({ id: z.string().uuid(), title: z.string().nullable() })), drafts: z.array(savedAdDraftSchema) }).safeParse(await request("/api/author/marketing/ad-drafts"));
    if (!parsed.success) throw new Error("Saved drafts could not be read. Reload and try again.");
    return parsed.data;
  },
  async save(bookId, draft, current) {
    const response = await request(`/api/author/marketing/ad-drafts${current ? `/${encodeURIComponent(current.id)}` : ""}`, {
      method: current ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(current ? { draft, expectedUpdatedAt: current.updatedAt } : { bookId, draft }),
    });
    const parsed = savedAdDraftSchema.safeParse(response?.draft);
    if (!parsed.success || (current && parsed.data.id !== current.id) || parsed.data.bookId !== bookId) throw new Error(uncertain);
    return parsed.data;
  },
};
