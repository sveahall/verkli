import { beforeEach, describe, expect, it, vi } from "vitest";

type RateResult = { allowed: boolean; retryAfterSeconds?: number };
const mocks = vi.hoisted(() => ({
  searchBooks: vi.fn(),
  getBook: vi.fn(),
  getAuthor: vi.fn(),
  rateLimitCheck: vi.fn<(id: string) => RateResult | Promise<RateResult>>(),
}));

vi.mock("@/lib/api/mcp-tools", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/mcp-tools")>(
    "@/lib/api/mcp-tools"
  );
  return {
    ...actual,
    searchBooks: mocks.searchBooks,
    getBook: mocks.getBook,
    getAuthor: mocks.getAuthor,
  };
});

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: (id: string) => mocks.rateLimitCheck(id),
  }),
}));

const { GET, POST } = await import("./route");

function rpc(method: string, params?: Record<string, unknown>, id: number | null = 1) {
  return new Request("http://localhost/api/public/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
  });
}

describe("/api/public/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockReturnValue({ allowed: true });
  });

  it("GET returns server info", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("verkli-public");
    expect(body.tools).toEqual(["search_books", "get_book", "get_author"]);
  });

  it("initialize returns protocolVersion + capabilities", async () => {
    const res = await POST(rpc("initialize"));
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.protocolVersion).toBe("2024-11-05");
    expect(body.result.serverInfo.name).toBe("verkli-public");
    expect(body.result.capabilities.tools).toEqual({});
  });

  it("tools/list returns the three tools", async () => {
    const res = await POST(rpc("tools/list"));
    const body = await res.json();
    const names = (body.result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["search_books", "get_book", "get_author"]);
  });

  it("tools/call dispatches search_books and wraps result as text content", async () => {
    mocks.searchBooks.mockResolvedValue([{ id: "b1", title: "Hi" }]);
    const res = await POST(
      rpc("tools/call", { name: "search_books", arguments: { q: "hi", limit: 5 } })
    );
    const body = await res.json();
    expect(mocks.searchBooks).toHaveBeenCalledWith({
      q: "hi",
      language: undefined,
      is_free: undefined,
      limit: 5,
    });
    expect(body.result.content[0].type).toBe("text");
    expect(JSON.parse(body.result.content[0].text)).toEqual([{ id: "b1", title: "Hi" }]);
  });

  it("tools/call get_book without id returns -32602", async () => {
    const res = await POST(rpc("tools/call", { name: "get_book", arguments: {} }));
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it("tools/call unknown tool returns -32601", async () => {
    const res = await POST(rpc("tools/call", { name: "nope", arguments: {} }));
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("notifications/initialized has no response (204)", async () => {
    const req = new Request("http://localhost/api/public/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
  });

  it("rate limited returns 429 with JSON-RPC error envelope", async () => {
    mocks.rateLimitCheck.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 });
    const res = await POST(rpc("tools/list"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe(-32000);
  });

  it("returns -32600 for malformed items inside a batch request", async () => {
    const res = await POST(
      new Request("http://localhost/api/public/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([null, { jsonrpc: "2.0", id: 2, method: "ping" }]),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });
    expect(body[1]).toMatchObject({ jsonrpc: "2.0", id: 2, result: {} });
  });

  it("tools/call get_book returns null when book not found", async () => {
    mocks.getBook.mockResolvedValue(null);
    const res = await POST(
      rpc("tools/call", { name: "get_book", arguments: { id: "11111111-1111-4111-8111-111111111111" } })
    );
    const body = await res.json();
    expect(JSON.parse(body.result.content[0].text)).toBeNull();
  });
});
