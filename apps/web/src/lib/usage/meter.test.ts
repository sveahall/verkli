import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const priceSelectMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === "usage_price_book" ? { select: priceSelectMock } : { insert: insertMock },
  }),
}));

const { recordUsage } = await import("./meter");

const ctx = { userId: "user-1", pipeline: "editorial" as const, bookId: "book-1" };

describe("recordUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    priceSelectMock.mockResolvedValue({
      data: [
        {
          version: "2026-09",
          provider: "openai",
          model: "gpt-6-astra",
          unit: "input_tokens",
          usd_per_unit: 0.0000025,
          effective_from: "2026-09-01T00:00:00Z",
          effective_to: null,
        },
      ],
      error: null,
    });
    insertMock.mockResolvedValue({ error: null });
  });

  it("writes one row per event with the raw quantity and the priced cost", async () => {
    await recordUsage(ctx, [
      { kind: "ai_call", provider: "openai", model: "gpt-6-astra", quantity: 40_000, unit: "input_tokens" },
    ]);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [rows] = insertMock.mock.calls[0];
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      pipeline: "editorial",
      book_id: "book-1",
      quantity: 40_000,
      unit: "input_tokens",
      cost_usd: 0.1,
      price_version: "2026-09",
    });
  });

  it("still records the quantity when the unit has no price", async () => {
    await recordUsage(ctx, [
      { kind: "ai_call", provider: "elevenlabs", model: "eleven_multilingual_v2", quantity: 8_120, unit: "chars" },
    ]);
    const [rows] = insertMock.mock.calls[0];
    expect(rows[0].quantity).toBe(8_120);
    expect(rows[0].cost_usd).toBeNull();
    expect(rows[0].meta.price_missing).toBe(true);
  });

  it("does nothing at all when there is no meter context", async () => {
    await recordUsage(undefined, [
      { kind: "ai_call", provider: "openai", quantity: 1, unit: "input_tokens" },
    ]);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("never throws when the insert fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    await expect(
      recordUsage(ctx, [{ kind: "ai_call", quantity: 1, unit: "input_tokens" }])
    ).resolves.toBeUndefined();
  });

  it("never throws when the database is unreachable", async () => {
    insertMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      recordUsage(ctx, [{ kind: "ai_call", quantity: 1, unit: "input_tokens" }])
    ).resolves.toBeUndefined();
  });

  it("never throws when the price lookup itself fails", async () => {
    priceSelectMock.mockRejectedValue(new Error("no route to host"));
    await expect(
      recordUsage(ctx, [{ kind: "ai_call", quantity: 1, unit: "input_tokens" }])
    ).resolves.toBeUndefined();
  });

  it("skips zero-quantity events so empty replies do not create noise", async () => {
    await recordUsage(ctx, [{ kind: "ai_call", quantity: 0, unit: "input_tokens" }]);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("writes the surviving events when only some are zero", async () => {
    await recordUsage(ctx, [
      { kind: "ai_call", provider: "openai", model: "gpt-6-astra", quantity: 0, unit: "input_tokens" },
      { kind: "ai_call", provider: "openai", model: "gpt-6-astra", quantity: 340, unit: "output_tokens" },
    ]);
    const [rows] = insertMock.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].unit).toBe("output_tokens");
  });
});
