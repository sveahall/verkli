import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnsubscribeToken } from "@/lib/newsletters/unsubscribe-token";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), enabled: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/flags", () => ({ isNewslettersEnabled: mocks.enabled }));
const { GET, POST } = await import("./route");

describe("newsletter unsubscribe", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEWSLETTER_UNSUBSCRIBE_SECRET", "test-only-secret"); mocks.enabled.mockReturnValue(false); });
  afterEach(() => vi.unstubAllEnvs());

  it.each([GET, POST])("honors signed unsubscribe even after sending is disabled", async (handler) => {
    const eq = vi.fn().mockReturnThis();
    const chain = { eq, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })) };
    const update = vi.fn(() => chain);
    mocks.admin.mockReturnValue({ from: () => ({ update }) });
    const token = createUnsubscribeToken("author-1", "reader-1");
    const response = await handler(new Request(`https://example.com/api/newsletters/unsubscribe?token=${token}`, { method: handler === GET ? "GET" : "POST" }));
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "unsubscribed" }));
    expect(eq).toHaveBeenCalledWith("author_id", "author-1");
    expect(eq).toHaveBeenCalledWith("subscriber_user_id", "reader-1");
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("rejects a tampered token without accessing subscriber data", async () => {
    mocks.enabled.mockReturnValue(true);
    const token = createUnsubscribeToken("author-1", "reader-1");
    const response = await GET(new Request(`https://example.com/api/newsletters/unsubscribe?token=${token}invalid`));
    expect(response.status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects an expired token without accessing subscriber data", async () => {
    mocks.enabled.mockReturnValue(true);
    const token = createUnsubscribeToken("author-1", "reader-1", new Date("2020-01-01"));
    const response = await GET(new Request(`https://example.com/api/newsletters/unsubscribe?token=${token}`));
    expect(response.status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
