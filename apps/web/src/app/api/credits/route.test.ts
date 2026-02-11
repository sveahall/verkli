import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import {
  E_CREDITS_LOAD_FAILED,
  E_PRO_SUBSCRIPTION_REQUIRED,
  E_UNAUTHORIZED,
  apiError,
} from "@/lib/api-errors";
import { API_ROUTES } from "@/lib/api-routes";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireProBillingForApi: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: mocks.requireProBillingForApi,
}));

const { GET } = await import("./balance/route");

function makeSupabaseClient(
  userId: string | null,
  userCreditsResult: { data: unknown; error: { code?: string; message: string } | null } = {
    data: { token_balance: 0 },
    error: null,
  }
) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: userId
            ? {
                id: userId,
                email: `${userId}@example.com`,
              }
            : null,
        },
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "user_credits") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => userCreditsResult),
          })),
        })),
      };
    }),
  };
}

describe(`GET ${API_ROUTES.creditsBalance}`, () => {
  it("fails fast if route module file is missing", () => {
    expect(existsSync(new URL("./balance/route.ts", import.meta.url))).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProBillingForApi.mockResolvedValue({
      ok: true,
      state: {
        plan: "pro",
        status: "active",
        isProActive: true,
      },
    });
  });

  it("returns UNAUTHORIZED when user is missing", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient(null));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe(E_UNAUTHORIZED);
  });

  it("forwards subscription gate response when user is not eligible", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.requireProBillingForApi.mockResolvedValue({
      ok: false,
      response: apiError(E_PRO_SUBSCRIPTION_REQUIRED, 403),
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(E_PRO_SUBSCRIPTION_REQUIRED);
  });

  it("returns CREDITS_LOAD_FAILED when DB read fails", async () => {
    mocks.createClient.mockResolvedValue(
      makeSupabaseClient("reader-1", {
        data: null,
        error: { code: "XX000", message: "boom" },
      })
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_CREDITS_LOAD_FAILED);
  });

  it("returns balance payload for authenticated pro users", async () => {
    mocks.createClient.mockResolvedValue(
      makeSupabaseClient("reader-1", {
        data: { token_balance: 1337 },
        error: null,
      })
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.balance).toBe(1337);
    expect(body.error).toBeUndefined();
  });
});
