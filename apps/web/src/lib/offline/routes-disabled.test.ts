import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: false,
  createClient: vi.fn(),
  getBillingStateForUser: vi.fn(),
  canUserReadBook: vi.fn(),
  buildChapterContentHash: vi.fn(),
}));
vi.mock("@/lib/flags", () => ({ isOfflineReadingEnabled: () => mocks.enabled }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/billing/server", () => ({ getBillingStateForUser: mocks.getBillingStateForUser }));
vi.mock("@/lib/books/access", () => ({ canUserReadBook: mocks.canUserReadBook }));
vi.mock("@/lib/offline/hash", () => ({ buildChapterContentHash: mocks.buildChapterContentHash, sha256Hex: vi.fn() }));

// Keep both route handlers, their shared access guard and the production
// availability constant real: a route must not accidentally bypass the gate.
import { GET } from "@/app/api/offline/books/[id]/manifest/route";
import { POST } from "@/app/api/offline/books/[id]/chapters/route";

describe("production offline routes remain disabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([false, true])("blocks manifest and chapter requests with legacy flag %s before auth or content access", async (enabled) => {
    mocks.enabled = enabled;
    const responses = await Promise.all([
      GET(new Request("http://localhost/api/offline/books/book/manifest?lang=sv"), { params: Promise.resolve({ id: "book" }) }),
      POST(new Request("http://localhost/api/offline/books/book/chapters", { method: "POST", body: "invalid JSON" }), { params: Promise.resolve({ id: "book" }) }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "OFFLINE_FEATURE_DISABLED" });
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getBillingStateForUser).not.toHaveBeenCalled();
    expect(mocks.canUserReadBook).not.toHaveBeenCalled();
    expect(mocks.buildChapterContentHash).not.toHaveBeenCalled();
  });
});
