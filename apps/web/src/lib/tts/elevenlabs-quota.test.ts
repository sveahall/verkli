import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRemainingCredits } from "./elevenlabs-quota";

const ORIGINAL_KEY = process.env.ELEVENLABS_API_KEY;

function mockFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getRemainingCredits", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (typeof ORIGINAL_KEY === "undefined") delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = ORIGINAL_KEY;
  });

  it("returns limit minus used", async () => {
    mockFetch(() => jsonResponse({ character_limit: 40_000, character_count: 3_164 }));

    await expect(getRemainingCredits()).resolves.toEqual({ remaining: 36_836 });
  });

  it("sends the api key as xi-api-key", async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal("fetch", ((_url: string, init?: RequestInit) => {
      seen = init;
      return jsonResponse({ character_limit: 10, character_count: 0 });
    }) as unknown as typeof fetch);

    await getRemainingCredits();

    expect((seen?.headers as Record<string, string> | undefined)?.["xi-api-key"]).toBe(
      "test-key"
    );
  });

  it("clamps to zero rather than reporting a negative balance", async () => {
    mockFetch(() => jsonResponse({ character_limit: 100, character_count: 250 }));

    await expect(getRemainingCredits()).resolves.toEqual({ remaining: 0 });
  });

  // Every branch below returns remaining: null, and the checkout route treats
  // null as "refuse". That makes these the paths that would silently block all
  // audiobook sales, which is why each one is pinned.
  it("reports no_api_key without calling the API", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const spy = vi.fn(() => jsonResponse({}));
    vi.stubGlobal("fetch", spy);

    await expect(getRemainingCredits()).resolves.toEqual({
      remaining: null,
      reason: "no_api_key",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports request_failed on a non-ok response", async () => {
    mockFetch(() => jsonResponse({ detail: "nope" }, 401));

    await expect(getRemainingCredits()).resolves.toEqual({
      remaining: null,
      reason: "request_failed",
    });
  });

  it("reports request_failed when the call throws", async () => {
    mockFetch(() => {
      throw new Error("network down");
    });

    await expect(getRemainingCredits()).resolves.toEqual({
      remaining: null,
      reason: "request_failed",
    });
  });

  it("reports unexpected_shape when the counts are missing", async () => {
    mockFetch(() => jsonResponse({ tier: "starter" }));

    await expect(getRemainingCredits()).resolves.toEqual({
      remaining: null,
      reason: "unexpected_shape",
    });
  });

  it("reports unexpected_shape when a count is not a number", async () => {
    mockFetch(() => jsonResponse({ character_limit: "40000", character_count: 0 }));

    await expect(getRemainingCredits()).resolves.toEqual({
      remaining: null,
      reason: "unexpected_shape",
    });
  });

  it("never throws, whatever the API returns", async () => {
    mockFetch(() => new Response("not json", { status: 200 }));

    await expect(getRemainingCredits()).resolves.toMatchObject({ remaining: null });
  });
});
