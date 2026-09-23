import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gate: vi.fn(), scope: vi.fn(), getMemory: vi.fn(), mutate: vi.fn(), getConversations: vi.fn(), create: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.gate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ marker: "client" }) }));
vi.mock("./server", async (original) => ({ ...await original<typeof import("./server")>(), requireMemoryScope: mocks.scope, getMemorySnapshot: mocks.getMemory, mutateMemory: mocks.mutate, getConversationSnapshot: mocks.getConversations, createConversation: mocks.create, deleteConversation: mocks.remove }));
const memory = await import("@/app/api/books/[id]/ai/memory/route");
const conversations = await import("@/app/api/books/[id]/ai/conversations/route");
const book = "11111111-1111-4111-8111-111111111111";
const edition = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id: book }) };
function request(path: string, body?: unknown) { return new NextRequest(`http://localhost/api/books/${book}/ai/${path}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }); }
describe("AI memory routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.gate.mockResolvedValue({ user: { id: "owner" }, response: null }); mocks.scope.mockResolvedValue(undefined); mocks.getMemory.mockResolvedValue({ enabled: true, memories: [] }); mocks.getConversations.mockResolvedValue({ threads: [], thread: null, messages: [] }); });
  it("requires author authentication before memory access", async () => {
    mocks.gate.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await memory.GET(request("memory"), context)).status).toBe(401);
    expect(mocks.scope).not.toHaveBeenCalled();
  });
  it("validates book and edition for both GET snapshots", async () => {
    expect((await memory.GET(request(`memory?editionId=${edition}`), context)).status).toBe(200);
    expect((await conversations.GET(request(`conversations?editionId=${edition}&tool=edit`), context)).status).toBe(200);
    expect(mocks.scope).toHaveBeenNthCalledWith(1, expect.anything(), "owner", book, edition);
    expect(mocks.scope).toHaveBeenNthCalledWith(2, expect.anything(), "owner", book, edition);
  });
  it("rejects inferred or owner-selected data and malformed scope", async () => {
    expect((await memory.POST(request("memory", { operation: "save", scope: "book", content: "Short", ownerId: "intruder" }), context)).status).toBe(400);
    expect((await memory.POST(request("memory", { operation: "save", scope: "edition", content: "Short" }), context)).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("derives the mutation owner from authentication", async () => {
    mocks.mutate.mockResolvedValue({ enabled: true, memories: [] });
    const body = { operation: "save", scope: "author", content: "Concise dialogue" };
    expect((await memory.POST(request("memory", body), context)).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith(expect.anything(), "owner", book, body);
  });
  it("rejects invalid tool and thread identifiers", async () => {
    expect((await conversations.GET(request("conversations?tool=admin"), context)).status).toBe(400);
    expect((await conversations.POST(request("conversations", { operation: "delete", threadId: "foreign" }), context)).status).toBe(400);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("returns stable create and delete contracts", async () => {
    mocks.create.mockResolvedValue({ id: edition, title: "New conversation", updatedAt: "now" });
    expect(await (await conversations.POST(request("conversations", { operation: "create", tool: "edit", editionId: edition }), context)).json()).toEqual({ thread: { id: edition, title: "New conversation", updatedAt: "now" } });
    expect(await (await conversations.POST(request("conversations", { operation: "delete", threadId: edition }), context)).json()).toEqual({ deleted: true });
    expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), book, edition);
  });
});
