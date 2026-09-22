import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the early-exit paths only — the gates, the idempotent read-back and
 * the atomic claim. The generation path below them needs the books,
 * media_assets and storage chains and is left to an integration test.
 *
 * This route had no test file at all while spending ~$0.15 of Higgsfield credit
 * per call, which is how it ended up with no rate limit, no billing gate, no
 * demo guard and no idempotence.
 */

const POST_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const AUTHOR_ID = "author-1";

// The SSRF allow-list reads this at call time; the compare-and-set sits just
// past the cover-image guard, so the race test needs a cover URL that passes.
process.env.AI_IMAGE_URL_EXTRA_HOSTS = "cdn.example.com";
const COVER_URL = "https://cdn.example.com/cover.jpg";

const mocks = vi.hoisted(() => ({
  requireAuthorAndMarketingEnabled: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  requireProBillingForApi: vi.fn(),
  evaluateDemoGuard: vi.fn(),
  rateLimitCheck: vi.fn(),
  generateImageToVideo: vi.fn(),
}));

vi.mock("@/lib/auth/require-author-marketing", () => ({
  requireAuthorAndMarketingEnabled: mocks.requireAuthorAndMarketingEnabled,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: mocks.requireProBillingForApi,
}));
vi.mock("@/lib/demo-guard", () => ({ evaluateDemoGuard: mocks.evaluateDemoGuard }));
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({ check: mocks.rateLimitCheck }),
}));
vi.mock("@/lib/higgsfield", () => ({
  generateImageToVideo: mocks.generateImageToVideo,
}));
vi.mock("@/lib/marketing/trailer-storage", () => ({
  uploadTrailerAndGetPublicUrl: vi.fn(),
}));
vi.mock("@/lib/ai/trailer-generation", () => ({ generateTrailerPrompt: vi.fn() }));

const { POST } = await import("./route");

type PostRow = Record<string, unknown>;

/**
 * @param claimedRows what the compare-and-set update returns. [] means another
 *   request won the race.
 */
function mockSupabase(post: PostRow | null, claimedRows: unknown[] = [{ id: POST_ID }]) {
  const from = vi.fn((table: string) => {
    if (table === "books") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "book-1",
                title: "A Book",
                description: "A description",
                cover_image: COVER_URL,
              },
              error: null,
            }),
          })),
        })),
      };
    }
    if (table !== "marketing_posts") return {};
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: post, error: null }),
          })),
        })),
      })),
      update: vi.fn(() => {
        // The claim is `.update().eq("id").eq("status").select("id")`; the
        // failure paths elsewhere in the route use `.update().eq("id")` and
        // await that directly. Make the second .eq() thenable so both shapes
        // work off one mock.
        const claim = {
          select: vi.fn().mockResolvedValue({ data: claimedRows, error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: null, error: null }),
        };
        return { eq: vi.fn(() => ({ eq: vi.fn(() => claim), ...claim })) };
      }),
    };
  });
  mocks.createClient.mockResolvedValue({ from });
  mocks.createAdminClient.mockReturnValue({ from });
  return from;
}

function readyPost(): PostRow {
  return {
    id: POST_ID,
    book_id: "book-1",
    author_id: AUTHOR_ID,
    language: "sv",
    channel: "instagram",
    content_type: "trailer",
    caption: "A caption",
    hashtags: "#a #b",
    status: "ready",
    media_asset_id: "asset-1",
    media_asset_url: "https://cdn.example.com/trailer.mp4",
  };
}

function pendingPost(): PostRow {
  return { ...readyPost(), status: "asset_pending", media_asset_url: null };
}

function freshPost(): PostRow {
  return { ...readyPost(), status: "draft", media_asset_id: null, media_asset_url: null };
}

function call() {
  return POST(new Request("http://localhost/x", { method: "POST" }), {
    params: Promise.resolve({ id: POST_ID }),
  });
}

describe("POST /api/author/marketing/posts/[id]/generate-trailer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorAndMarketingEnabled.mockResolvedValue({
      user: { id: AUTHOR_ID },
      response: null,
    });
    mocks.requireProBillingForApi.mockResolvedValue({ ok: true, state: {} });
    mocks.evaluateDemoGuard.mockResolvedValue({ shouldSkip: false });
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true });
  });

  describe("idempotent read-back", () => {
    it("returns the existing asset without spending anything", async () => {
      mockSupabase(readyPost());

      const res = await call();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.reused).toBe(true);
      expect(body.post.mediaAssetUrl).toBe("https://cdn.example.com/trailer.mp4");
      expect(mocks.generateImageToVideo).not.toHaveBeenCalled();
    });

    it("matches the success path's response shape — hashtags is a string", async () => {
      mockSupabase(readyPost());

      const body = await (await call()).json();

      // The success path returns hashtagsArr.join(" "). A null here would make
      // `post.hashtags.split(" ")` throw on the reused branch only.
      expect(typeof body.post.hashtags).toBe("string");
      expect(body.post.hashtags).toBe("#a #b");
    });

    it("works for an author whose Pro subscription has lapsed", async () => {
      mockSupabase(readyPost());
      mocks.requireProBillingForApi.mockResolvedValue({
        ok: false,
        response: new Response(null, { status: 402 }),
      });

      // Reading back costs nothing, so billing must not stand in the way of
      // work the author already paid for.
      expect((await call()).status).toBe(200);
    });

    it("does not spend a rate-limit token", async () => {
      mockSupabase(readyPost());
      await call();
      expect(mocks.rateLimitCheck).not.toHaveBeenCalled();
    });
  });

  describe("concurrency", () => {
    it("refuses with 409 while a job is already in flight", async () => {
      mockSupabase(pendingPost());

      const res = await call();

      expect(res.status).toBe(409);
      expect(mocks.generateImageToVideo).not.toHaveBeenCalled();
    });

    it("refuses with 409 when the compare-and-set loses the race", async () => {
      // Status read as "draft", but another request claimed the row first, so
      // the conditional update matches zero rows.
      mockSupabase(freshPost(), []);

      const res = await call();

      expect(res.status).toBe(409);
      expect(mocks.generateImageToVideo).not.toHaveBeenCalled();
    });
  });

  describe("gate ordering", () => {
    it("lets the demo guard answer before the rate limit or billing runs", async () => {
      mockSupabase(freshPost());
      mocks.evaluateDemoGuard.mockResolvedValue({
        shouldSkip: true,
        response: Response.json({ ok: true, demo_mode: true }),
      });

      const body = await (await call()).json();

      expect(body.demo_mode).toBe(true);
      expect(mocks.rateLimitCheck).not.toHaveBeenCalled();
      expect(mocks.requireProBillingForApi).not.toHaveBeenCalled();
      expect(mocks.generateImageToVideo).not.toHaveBeenCalled();
    });

    it("returns 429 without spending when the rate limit is exhausted", async () => {
      mockSupabase(freshPost());
      mocks.rateLimitCheck.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });

      expect((await call()).status).toBe(429);
      expect(mocks.generateImageToVideo).not.toHaveBeenCalled();
    });

    it("returns the billing response without spending when Pro is inactive", async () => {
      mockSupabase(freshPost());
      mocks.requireProBillingForApi.mockResolvedValue({
        ok: false,
        response: new Response(null, { status: 402 }),
      });

      expect((await call()).status).toBe(402);
      expect(mocks.generateImageToVideo).not.toHaveBeenCalled();
    });
  });

  it("404s a post that is not the caller's", async () => {
    mockSupabase(null);
    expect((await call()).status).toBe(404);
  });
});
