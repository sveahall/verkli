import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_INVALID_REFERRAL_CODE,
  E_REFERRAL_ALREADY_REDEEMED,
  E_REFERRAL_CANNOT_USE_OWN,
  E_REFERRAL_CODE_INVALID,
  E_REFERRAL_GENERATE_FAILED,
  E_REFERRAL_REDEEM_FAILED,
  E_UNAUTHORIZED,
} from "@/lib/api-errors";

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
  hasExistingRedemption?: boolean;
  insertRedemptionError?: { code?: string; message: string } | null;
  redeemerBalance?: number;
  referrerBalance?: number;
  upsertRedeemerError?: { code?: string; message: string } | null;
  upsertReferrerError?: { code?: string; message: string } | null;
}) {
  const state = {
    upserts: [] as Array<Record<string, unknown>>,
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
                data: input?.hasExistingRedemption ? { id: "redemption-1" } : null,
                error: null,
              })),
            })),
          })),
          insert: vi.fn(async () => ({
            error: input?.insertRedemptionError ?? null,
          })),
        };
      }

      if (table === "user_credits") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, userId: string) => ({
              maybeSingle: vi.fn(async () => {
                if (userId === "reader-1") {
                  return {
                    data:
                      typeof input?.redeemerBalance === "number"
                        ? { user_id: userId, token_balance: input.redeemerBalance }
                        : null,
                    error: null,
                  };
                }
                return {
                  data:
                    typeof input?.referrerBalance === "number"
                      ? { user_id: userId, token_balance: input.referrerBalance }
                      : null,
                  error: null,
                };
              }),
            })),
          })),
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            state.upserts.push(payload);
            const payloadUserId = String(payload.user_id ?? "");
            if (payloadUserId === "reader-1") {
              return { error: input?.upsertRedeemerError ?? null };
            }
            return { error: input?.upsertReferrerError ?? null };
          }),
        };
      }

      throw new Error(`Unexpected table for redeem route: ${table}`);
    }),
  };

  return { client, state };
}

function makeGenerateRequest(): Request {
  return new Request("http://localhost/api/referrals/generate", { method: "POST" });
}

function makeRedeemRequest(body: unknown): Request {
  return new Request("http://localhost/api/referrals/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/referrals/generate", () => {
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

describe("POST /api/referrals/redeem", () => {
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
        hasExistingRedemption: true,
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
      redeemerBalance: 50,
      referrerBalance: 200,
    });
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(admin.client);

    const res = await redeemPOST(makeRedeemRequest({ code: "GOOD1234" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.creditsAdded).toBe(100);
    expect(admin.state.upserts).toContainEqual({
      user_id: "reader-1",
      token_balance: 150,
    });
    expect(admin.state.upserts).toContainEqual({
      user_id: "referrer-1",
      token_balance: 300,
    });
  });

  it("returns REFERRAL_REDEEM_FAILED on downstream DB failure", async () => {
    mocks.createClient.mockResolvedValue(makeSupabaseClient("reader-1"));
    mocks.createAdminClient.mockReturnValue(
      makeAdminClientForRedeem({
        referrerId: "referrer-1",
        insertRedemptionError: { code: "XX000", message: "boom" },
      }).client
    );

    const res = await redeemPOST(makeRedeemRequest({ code: "FAIL1234" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(E_REFERRAL_REDEEM_FAILED);
  });
});
