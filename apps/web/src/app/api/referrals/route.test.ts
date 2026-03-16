import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import {
  E_INVALID_REFERRAL_CODE,
  E_REFERRAL_ALREADY_REDEEMED,
  E_REFERRAL_CANNOT_USE_OWN,
  E_REFERRAL_CODE_INVALID,
  E_REFERRAL_GENERATE_FAILED,
  E_REFERRAL_REDEEM_FAILED,
  E_UNAUTHORIZED,
} from "@/lib/api-errors";
import { API_ROUTES } from "@/lib/api-routes";

// Referral generate/redeem route contract tests.

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({
    check: () => ({ allowed: true }),
  }),
}));

const { POST: generatePOST } = await import("./generate/route");
const { POST: redeemPOST } = await import("./redeem/route");

function makeSupabaseClient(userId: string | null) {
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
  };
}

function makeAdminClientForGenerate(input?: {
  existingCode?: string | null;
  insertErrors?: Array<{ code?: string; message: string } | null>;
}) {
  let insertAttempt = 0;

  return {
    from: vi.fn((table: string) => {
      if (table !== "referral_codes") {
        throw new Error(`Unexpected table for generate route: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: input?.existingCode ? { code: input.existingCode } : null,
              error: null,
            })),
          })),
        })),
        insert: vi.fn(async () => {
          const error = input?.insertErrors?.[insertAttempt] ?? null;
          insertAttempt += 1;
          return { error };
        }),
      };
    }),
  };
}

function makeAdminClientForRedeem(input?: {
  referrerId?: string | null;
  referralCodeLookupError?: { code?: string; message: string } | null;
  existingRedemption?: { id: string; referrer_id: string; code: string } | null;
  insertRedemptionError?: { code?: string; message: string } | null;
  grantRedeemerError?: { code?: string; message: string } | null;
  grantReferrerError?: { code?: string; message: string } | null;
}) {
  const state = {
    creditGrantCalls: [] as Array<Record<string, unknown>>,
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "referral_codes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                if (input?.referralCodeLookupError) {
                  return { data: null, error: input.referralCodeLookupError };
                }
                if (!input?.referrerId) {
                  return { data: null, error: null };
                }
                return { data: { user_id: input.referrerId }, error: null };
              }),
            })),
          })),
        };
      }

      if (table === "referral_redemptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: input?.existingRedemption ?? null,
                error: null,
              })),
            })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: input?.insertRedemptionError
                  ? null
                  : {
                      id: "redemption-1",
                      referrer_id: String(payload.referrer_id ?? input?.referrerId ?? ""),
                      code: String(payload.code ?? ""),
                    },
                error: input?.insertRedemptionError ?? null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table for redeem route: ${table}`);
    }),
    rpc: vi.fn(async (_fnName: string, args: Record<string, unknown>) => {
      state.creditGrantCalls.push(args);
      const source = String(args.p_source ?? "");
      if (source === "referral_redeemer") {
        return { data: true, error: input?.grantRedeemerError ?? null };
      }
      return { data: true, error: input?.grantReferrerError ?? null };
    }),
  };

  return { client, state };
}

function makeRedeemRequest(body: unknown): Request {
  return new Request(`http://localhost${API_ROUTES.referralsRedeem}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe(`POST ${API_ROUTES.referralsGenerate}`, () => {
  it("fails fast if generate route module file is missing", () => {
    expect(existsSync(new URL("./generate/route.ts", import.meta.url))).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHORIZED when user is missing", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient(null));
    mocks.createAdminClient.mockReturnValue(makeAdminClientForGenerate());

    const res = await generatePOST();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe(E_UNAUTHORIZED);
  });

  it("returns existing referral code when already present", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(makeAdminClientForGenerate({ existingCode: "ABCD1234" }));

    const res = await generatePOST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.code).toBe("ABCD1234");
  });

  it("returns REFERRAL_GENERATE_FAILED when insert has non-retryable DB error", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(
      makeAdminClientForGenerate({
        existingCode: null,
        insertErrors: [{ code: "XX000", message: "boom" }],
      })
    );

    const res = await generatePOST();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_REFERRAL_GENERATE_FAILED);
  });
});

describe(`POST ${API_ROUTES.referralsRedeem}`, () => {
  it("fails fast if redeem route module file is missing", () => {
    expect(existsSync(new URL("./redeem/route.ts", import.meta.url))).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHORIZED when user is missing", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient(null));
    mocks.createAdminClient.mockReturnValue(makeAdminClientForRedeem().client);

    const res = await redeemPOST(makeRedeemRequest({ code: "ABCD1234" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe(E_UNAUTHORIZED);
  });

  it("returns INVALID_REFERRAL_CODE when code is empty", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(makeAdminClientForRedeem().client);

    const res = await redeemPOST(makeRedeemRequest({ code: "   " }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(E_INVALID_REFERRAL_CODE);
  });

  it("returns REFERRAL_CODE_INVALID when code does not exist", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(
      makeAdminClientForRedeem({ referrerId: null }).client
    );

    const res = await redeemPOST(makeRedeemRequest({ code: "NOPE1234" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe(E_REFERRAL_CODE_INVALID);
  });

  it("returns REFERRAL_CANNOT_USE_OWN when user redeems own code", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(
      makeAdminClientForRedeem({ referrerId: "reader-1" }).client
    );

    const res = await redeemPOST(makeRedeemRequest({ code: "SELF1234" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(E_REFERRAL_CANNOT_USE_OWN);
  });

  it("returns REFERRAL_ALREADY_REDEEMED when user already redeemed a code", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(
      makeAdminClientForRedeem({
        referrerId: "referrer-1",
        existingRedemption: {
          id: "redemption-1",
          referrer_id: "referrer-2",
          code: "USED1234",
        },
      }).client
    );

    const res = await redeemPOST(makeRedeemRequest({ code: "USED1234" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe(E_REFERRAL_ALREADY_REDEEMED);
  });

  it("returns success payload and creditsAdded on successful redemption", async () => {
    const admin = makeAdminClientForRedeem({
      referrerId: "referrer-1",
    });
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(admin.client);

    const res = await redeemPOST(makeRedeemRequest({ code: "GOOD1234" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.creditsAdded).toBe(100);
    expect(admin.state.creditGrantCalls).toContainEqual({
      p_user_id: "reader-1",
      p_delta: 100,
      p_source: "referral_redeemer",
      p_source_id: "redemption-1",
    });
    expect(admin.state.creditGrantCalls).toContainEqual({
      p_user_id: "referrer-1",
      p_delta: 100,
      p_source: "referral_referrer",
      p_source_id: "redemption-1",
    });
  });

  it("replays missing credit grants idempotently for an existing redemption", async () => {
    const admin = makeAdminClientForRedeem({
      referrerId: "referrer-1",
      existingRedemption: {
        id: "redemption-1",
        referrer_id: "referrer-1",
        code: "GOOD1234",
      },
    });
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(admin.client);

    const res = await redeemPOST(makeRedeemRequest({ code: "GOOD1234" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(admin.state.creditGrantCalls).toHaveLength(2);
  });

  it("returns REFERRAL_REDEEM_FAILED on downstream DB failure", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(
      makeAdminClientForRedeem({
        referrerId: "referrer-1",
        grantRedeemerError: { code: "XX000", message: "boom" },
      }).client
    );

    const res = await redeemPOST(makeRedeemRequest({ code: "FAIL1234" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_REFERRAL_REDEEM_FAILED);
  });
});
