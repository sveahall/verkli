import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMemorySnapshot, getPreferences, mutateMemory, getConversationSnapshot, reserveTurn, completeTurn, requireMemoryScope } from "./server";

function database(results: Array<{ data: unknown; error?: unknown }>) {
  const calls: Array<{ table: string; operations: Array<[string, ...unknown[]]> }> = [];
  const client = {
    from: (table: string) => {
      const call = { table, operations: [] as Array<[string, ...unknown[]]> }; calls.push(call);
      const result = results.shift() ?? { data: null };
      const query: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null, ...result }).then(resolve) };
      for (const name of ["select", "eq", "is", "or", "order", "limit", "neq", "update", "insert", "delete", "upsert"]) query[name] = (...args: unknown[]) => { call.operations.push([name, ...args]); return query; };
      query.maybeSingle = query.single = () => Promise.resolve({ error: null, ...result });
      return query;
    },
    rpc: vi.fn(),
  };
  return { client: client as unknown as Parameters<typeof getPreferences>[0], calls, rpc: client.rpc };
}
const owner = "11111111-1111-4111-8111-111111111111";
const book = "22222222-2222-4222-8222-222222222222";

describe("private memory server", () => {
  beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());
  it("does not read preference content when disabled", async () => {
    const db = database([{ data: { enabled: false } }]);
    expect(await getPreferences(db.client, owner, book, null)).toEqual([]);
    expect(db.calls.map((c) => c.table)).toEqual(["ai_memory_settings"]);
  });
  it("bounds applicable memories and scopes every query to the owner", async () => {
    const db = database([{ data: null }, { data: [{ id: "memory", content: "Short prose", scope: "book", updated_at: "date" }] }]);
    expect(await getMemorySnapshot(db.client, owner, book, null)).toEqual({ enabled: true, memories: [{ id: "memory", content: "Short prose", scope: "book", updatedAt: "date" }] });
    expect(db.calls[1].operations).toContainEqual(["limit", 24]);
    expect(db.calls[1].operations).toContainEqual(["eq", "owner_id", owner]);
    expect(db.calls[1].operations).toContainEqual(["or", `scope.eq.author,and(scope.eq.book,book_id.eq.${book})`]);
  });
  it("rejects a foreign book and a foreign edition before reading AI data", async () => {
    const foreign = database([{ data: { author_id: "another" } }]);
    await expect(requireMemoryScope(foreign.client, owner, book, null)).rejects.toMatchObject({ status: 403 });
    const edition = database([{ data: { author_id: owner, deleted_at: null } }, { data: null }]);
    await expect(requireMemoryScope(edition.client, owner, book, book)).rejects.toMatchObject({ status: 404 });
    expect(edition.calls[1].operations).toContainEqual(["eq", "book_id", book]);
  });
  it("writes only explicit content with a server-derived owner and edition scope", async () => {
    const db = database([{ data: null }, { data: null }, { data: [] }]);
    await mutateMemory(db.client, owner, book, { operation: "save", content: "Use Swedish punctuation", scope: "edition", editionId: owner });
    expect(db.calls[0].operations).toContainEqual(["insert", { owner_id: owner, book_id: book, edition_id: owner, scope: "edition", content: "Use Swedish punctuation" }]);
  });
  it("updates content in the original scope without upserting deleted memories", async () => {
    const db = database([{ data: { id: "memory" } }, { data: null }, { data: [] }]);
    await mutateMemory(db.client, owner, book, { operation: "save", id: book, content: "New preference", scope: "book" });
    expect(db.calls[0].operations).toEqual(expect.arrayContaining([["update", { content: "New preference" }], ["eq", "owner_id", owner], ["eq", "book_id", book], ["eq", "scope", "book"], ["is", "edition_id", null]]));
    const deleted = database([{ data: null }]);
    await expect(mutateMemory(deleted.client, owner, book, { operation: "save", id: book, content: "Stale edit", scope: "book" })).rejects.toMatchObject({ status: 404 });
    expect(deleted.calls[0].operations.some(([name]) => name === "insert" || name === "upsert")).toBe(false);
  });
  it("deletes only a memory applicable to the current book and edition", async () => {
    const db = database([{ data: { id: "memory" } }, { data: null }, { data: [] }]);
    await mutateMemory(db.client, owner, book, { operation: "delete", id: book });
    expect(db.calls[0].operations).toContainEqual(["eq", "owner_id", owner]);
    expect(db.calls[0].operations).toContainEqual(["or", `scope.eq.author,and(scope.eq.book,book_id.eq.${book})`]);
  });
  it("returns an explicit unavailable error when the migration is missing", async () => {
    const db = database([{ data: null, error: { code: "42P01", message: "private content must not escape" } }]);
    await expect(getPreferences(db.client, owner, book, null)).rejects.toEqual(expect.objectContaining({ status: 503, code: "AI_MEMORY_UNAVAILABLE" }));
  });
  it("loads bounded text-only history from the selected tool and edition", async () => {
    const thread = { id: "thread", title: "Discussion", updated_at: "now" };
    const db = database([{ data: [thread] }, { data: [{ id: "message", role: "assistant", content: "Historical suggestion", created_at: "now", actions: [{ kind: "edit_text" }] }] }]);
    const result = await getConversationSnapshot(db.client, owner, book, "edit", null);
    expect(db.calls[0].operations).toContainEqual(["eq", "tool", "edit"]);
    expect(db.calls[0].operations).toContainEqual(["is", "edition_id", null]);
    expect(db.calls[0].operations).toContainEqual(["limit", 20]);
    expect(db.calls[1].operations).toContainEqual(["limit", 50]);
    expect(result.messages[0]).not.toHaveProperty("actions");
  });
  it("does not silently fall back to another conversation for an invalid requested thread", async () => {
    const db = database([{ data: [] }, { data: null }]);
    await expect(getConversationSnapshot(db.client, owner, book, "edit", null, "missing")).rejects.toMatchObject({ status: 404 });
  });
  it("omits absent optional RPC scope arguments so SQL defaults apply without generated-type casts", async () => {
    const db = database([]);
    db.rpc.mockResolvedValue({ data: { status: "reserved", threadId: book, replyId: owner }, error: null });
    await reserveTurn(db.client, { bookId: book, editionId: null, tool: "edit", requestId: owner, message: "Help" });
    expect(JSON.parse(JSON.stringify(db.rpc.mock.calls[0][1]))).toEqual({ p_book_id: book, p_tool: "edit", p_request_id: owner, p_content: "Help" });
  });
  it("reserves once and reports conflicts without inventing a new request", async () => {
    const db = database([]);
    db.rpc.mockResolvedValue({ data: { status: "pending", threadId: book }, error: null });
    await expect(reserveTurn(db.client, { bookId: book, editionId: null, tool: "edit", requestId: owner, message: "Help" })).rejects.toMatchObject({ status: 409, code: "AI_CONVERSATION_PENDING" });
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["deleted", "interrupted"])("does not resend a %s request", async (status) => {
    const db = database([]); db.rpc.mockResolvedValue({ data: { status }, error: null });
    await expect(reserveTurn(db.client, { bookId: book, editionId: null, tool: "edit", requestId: owner, message: "Help" })).rejects.toMatchObject({ status: status === "deleted" ? 404 : 409 });
  });
  it("preserves concrete edit proposals as bounded unconfirmed text for durable follow-ups", async () => {
    const db = database([]);
    db.rpc.mockResolvedValue({ data: { status: "completed" }, error: null });
    await completeTurn(db.client, book, owner, "Here is a rewrite.", [{ kind: "edit_text", original: "The boat went away.", replacement: "The boat slipped into the fog.", reason: "More atmosphere." }]);
    const stored = db.rpc.mock.calls[0][1].p_content;
    expect(typeof stored).toBe("string");
    expect(stored).toContain("The boat slipped into the fog.");
    expect(stored).toContain("The boat went away.");
    expect(stored).toContain("Proposed only; no completed action reported.");
    expect(stored).toContain("no action execution is recorded");
    expect(stored).not.toContain("Saved context shortened");
  });
  it("bounds the complete persisted reply including its label to the replay schema limit", async () => {
    const db = database([]);
    db.rpc.mockResolvedValue({ data: { status: "completed" }, error: null });
    await completeTurn(db.client, book, owner, "x".repeat(4000), [{ kind: "cover_brief", prompt: "Harbour at dawn", style: "minimal", reason: "Quiet mood" }]);
    expect(db.rpc.mock.calls[0][1].p_content.length).toBeLessThanOrEqual(4000);
    expect(db.rpc.mock.calls[0][1].p_content).toContain("Harbour at dawn");
    expect(db.rpc.mock.calls[0][1].p_content).toContain("Saved context shortened");
  });
  it("does not claim persistence if the thread was deleted while generating", async () => {
    const db = database([]);
    db.rpc.mockResolvedValue({ data: { status: "deleted" }, error: null });
    expect(await completeTurn(db.client, book, owner, "Suggestion", [{ kind: "edit_text", original: "teh", replacement: "the", reason: "Spelling" }])).toBe(false);
    expect(db.rpc.mock.calls[0][1].p_content).toContain("Historical suggestion");
    expect(db.rpc.mock.calls[0][1].p_content).toContain("no action execution is recorded");
  });
});
