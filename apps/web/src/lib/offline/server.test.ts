import { describe, expect, it, vi } from "vitest";
const { createClient, getBillingStateForUser } = vi.hoisted(() => ({ createClient: vi.fn(), getBillingStateForUser: vi.fn() }));
vi.mock("@/lib/flags", () => ({ isOfflineReadingEnabled: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/billing/server", () => ({ getBillingStateForUser }));
vi.mock("@/lib/books/access", () => ({ canUserReadBook: vi.fn() }));
import { requireOfflineBookAccess } from "./server";

describe("secure offline download availability", () => {
  it("fails closed even when the old feature flag is enabled, without reading or changing entitlements", async () => {
    const result = await requireOfflineBookAccess({ bookId: "book" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Offline saving must remain unavailable");
    expect(result.response.status).toBe(503);
    expect(await result.response.json()).toMatchObject({ error: "OFFLINE_FEATURE_DISABLED" });
    expect(createClient).not.toHaveBeenCalled();
    expect(getBillingStateForUser).not.toHaveBeenCalled();
  });
});
