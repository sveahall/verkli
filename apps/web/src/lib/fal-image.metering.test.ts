import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const recordUsageMock = vi.fn();
vi.mock("@/lib/usage/meter", () => ({
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
}));

const uploadMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  }),
}));

const { generateCoverImages, FAL_MODEL_ID, COVER_COUNT } = await import("./fal-image");

const savedFetch = globalThis.fetch;

describe("generateCoverImages metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_KEY = "fal-test-key";
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const href = typeof url === "string" ? url : url.href;
      if (href.startsWith("https://fal.run/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ images: [{ url: "https://fal.media/out.png" }] }),
        };
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
    delete process.env.FAL_KEY;
  });

  it("records one row covering every render in the batch", async () => {
    const { requestId } = await generateCoverImages({
      prompt: "a lighthouse",
      meter: { userId: "user-1", pipeline: "cover", bookId: "book-1" },
    });
    const [ctx, events] = recordUsageMock.mock.calls[0];
    expect(ctx).toMatchObject({ userId: "user-1", pipeline: "cover", bookId: "book-1" });
    expect(events).toEqual([
      {
        kind: "ai_call",
        provider: "fal",
        model: FAL_MODEL_ID,
        quantity: COVER_COUNT,
        unit: "renders",
        requestId,
      },
    ]);
  });

  it("records nothing when no meter context is supplied", async () => {
    await generateCoverImages({ prompt: "a lighthouse" });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("bills every image, not one per call", async () => {
    await generateCoverImages({
      prompt: "a lighthouse",
      meter: { userId: "user-1", pipeline: "cover" },
    });
    const [, events] = recordUsageMock.mock.calls[0];
    expect(events[0].quantity).toBe(COVER_COUNT);
    expect(COVER_COUNT).toBeGreaterThan(1);
  });
});
