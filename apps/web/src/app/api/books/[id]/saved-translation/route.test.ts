import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
const { GET } = await import("./route");
const bookId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const targetId = "00000000-0000-4000-8000-000000000003";
let owner: string;
let sourceContent: string;
let missingSource: boolean;
let missingTarget: boolean;
let failTable: string;
let reads: Array<{ table: string; filters: unknown[][] }>;
function request(query = `sourceVersionId=${sourceId}&targetLanguage=sv`) {
  return GET(new Request(`http://localhost/api/books/${bookId}/saved-translation?${query}`), { params: Promise.resolve({ id: bookId }) });
}
beforeEach(() => {
  vi.clearAllMocks(); owner = "author"; missingSource = false; missingTarget = false; failTable = ""; reads = []; sourceContent = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Current original"}]}]}';
  mocks.auth.mockResolvedValue({ user: { id: "author" } });
  mocks.client.mockReturnValue({ from: (table: string) => {
    const filters: unknown[][] = []; reads.push({ table, filters });
    const result = () => {
      const source = filters.some(([field, value]) => (field === "id" || field === "book_version_id") && value === sourceId);
      return { error: table === failTable ? { code: "offline" } : null, data: table === "books" ? { author_id: owner } : table === "book_versions" ? source ? missingSource ? null : { id: sourceId, language_code: "en" } : missingTarget ? null : { id: targetId, language_code: "sv", status: "done" } : [{ id: source ? "source-chapter" : "target-chapter", title: "Chapter", content: source ? sourceContent : "Aktuell översättning", order: 0 }] };
    };
    const chain = { select: () => chain, eq: (...args: unknown[]) => { filters.push(args); return chain; }, is: (...args: unknown[]) => { filters.push(args); return chain; }, order: () => chain, limit: () => chain, maybeSingle: async () => result(), then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve) };
    return chain;
  } });
});
describe("saved translation read", () => {
  it("reads current content from exact book and editions without writing or invoking providers", async () => {
    const res = await request(); const body = await res.json();
    expect(res.status).toBe(200); expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(body.source.id).toBe(sourceId); expect(body.target.id).toBe(targetId);
    expect(body.source.chapters[0].text).toBe("Current original");
    expect(body.target.chapters[0].text).toBe("Aktuell översättning");
    const chapters = reads.filter((read) => read.table === "chapters");
    expect(chapters).toHaveLength(2);
    for (const read of chapters) { expect(read.filters).toContainEqual(["book_id", bookId]); expect(read.filters).toContainEqual(["deleted_at", null]); }
    expect(chapters[0].filters).toContainEqual(["book_version_id", sourceId]);
    expect(chapters[1].filters).toContainEqual(["book_version_id", targetId]);
    expect(reads.find((read) => read.filters.some(([f, v]) => f === "language_code" && v === "sv"))?.filters).toContainEqual(["book_id", bookId]);
  });
  it("preserves marked inline words, hard breaks and block boundaries without changing stored fingerprints", async () => {
    sourceContent = JSON.stringify({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "This is " }, { type: "text", text: "not", marks: [{ type: "italic" }] }, { type: "text", text: " the end." }] },
      { type: "paragraph", content: [{ type: "text", text: "Line one" }, { type: "hardBreak" }, { type: "text", text: "Line two" }] },
    ] });
    const body = await (await request()).json();
    expect(body.source.chapters[0].text).toBe("This is not the end.\n\nLine one\nLine two");
    const { hashTranslationSource } = await import("@/lib/translation-quality-report");
    expect(body.fingerprints.source).toBe(hashTranslationSource([{ id: "source-chapter", title: "Chapter", content: sourceContent, order: 0 }]));
  });
  it("returns an honest empty state when no target edition exists", async () => { missingTarget = true; expect((await (await request()).json()).target).toBeNull(); expect(reads.some((read) => read.table === "chapters")).toBe(false); });
  it("forwards expired sessions without database reads", async () => { mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) }); expect((await request()).status).toBe(401); expect(mocks.client).not.toHaveBeenCalled(); });
  it("rejects other owners before reading editions", async () => { owner = "other"; expect((await request()).status).toBe(404); expect(reads).toHaveLength(1); });
  it("rejects foreign or missing source editions", async () => { missingSource = true; expect((await request()).status).toBe(404); expect(reads.some((read) => read.table === "chapters")).toBe(false); });
  it.each(["", "sourceVersionId=bad&targetLanguage=sv", `sourceVersionId=${sourceId}&targetLanguage=xx`])("rejects invalid scope: %s", async (query) => { expect((await request(query)).status).toBe(400); expect(mocks.client).not.toHaveBeenCalled(); });
  it("rejects comparing the source language to itself", async () => { expect((await request(`sourceVersionId=${sourceId}&targetLanguage=en`)).status).toBe(400); });
  it.each(["books", "book_versions", "chapters"])("does not disguise %s failures as absent translations", async (table) => { failTable = table; expect((await request()).status).toBe(503); });
});
