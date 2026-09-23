import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changePostDelivery, consumePostDelivery } from "./post-delivery";
import type { createAdminClient } from "@/lib/supabase/admin";

let post: Record<string, unknown>;
let tick: number;
let failSave: boolean;
let failReceipt: boolean;
const enqueue = vi.fn(async () => "queue-id");

const valueAt = (row: Record<string, unknown>, field: string) => field.split(/->>?/).reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], row);
const client = { from(table: string) {
  let update: Record<string, unknown> | undefined;
  const filters: Array<[string, unknown]> = [];
  const result = () => {
    const row = table === "books" ? { id: "book", author_id: "author" } : post;
    if (!filters.every(([key, value]) => valueAt(row, key) === value)) return { data: null, error: null };
    if (update) {
      if (failSave || (failReceipt && (update.metadata as { delivery?: { state?: string } })?.delivery?.state === "simulated")) return { data: null, error: { message: "write unavailable" } };
      post = { ...post, ...update, updated_at: new Date(++tick).toISOString() };
    }
    return { data: structuredClone(table === "books" ? row : post), error: null };
  };
  const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; }, update: (value: Record<string, unknown>) => { update = value; return q; }, maybeSingle: async () => result(), single: async () => result(), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
  return q;
} } as unknown as ReturnType<typeof createAdminClient>;
const delivery = () => (post.metadata as { delivery: Record<string, unknown> }).delivery;
const change = (extra = {}) => changePostDelivery({ client, postId: "post", userId: "author", expectedUpdatedAt: post.updated_at as string, scheduledFor: new Date(Date.now() + 60_000).toISOString(), action: "schedule", enqueue, simulated: true, ...extra });
const consume = () => consumePostDelivery({ client, postId: "post", userId: "author", jobId: delivery().jobId as string, simulated: true, now: Date.now() + 120_000 });
beforeEach(() => {
  vi.clearAllMocks(); tick = Date.now(); failSave = false; failReceipt = false;
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
  enqueue.mockResolvedValue("queue-id");
  post = { id: "post", book_id: "book", author_id: "author", status: "ready", channel: "x", content_type: "text", caption: "Approved text", hashtags: "#book", cta: "Read now", share_url: null, metadata: { other: "kept" }, updated_at: new Date(tick).toISOString() };
});
afterEach(() => vi.unstubAllEnvs());
describe("version-bound local campaign simulation", () => {
  it("schedules the approved snapshot, consumes once and never marks it posted", async () => {
    await change();
    expect(delivery()).toMatchObject({ state: "scheduled", text: "Approved text\n\n#book\n\nRead now" });
    await consume(); const revision = post.updated_at; await consume();
    expect(post.updated_at).toBe(revision);
    expect(post).toMatchObject({ status: "ready", metadata: { other: "kept", delivery: { state: "simulated", simulated: true } } });
    expect(post.posted_url).toBeUndefined();
  });
  it("rejects stale approval, unapproved content and unsupported channels", async () => {
    await expect(change({ expectedUpdatedAt: "old" })).rejects.toThrow(/changed/i);
    post.status = "draft"; await expect(change()).rejects.toThrow(/approve/i);
    post.status = "ready"; post.channel = "instagram"; await expect(change()).rejects.toThrow(/manual/i);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("only one concurrent schedule wins", async () => {
    const revision = post.updated_at;
    const results = await Promise.allSettled([change({ expectedUpdatedAt: revision }), change({ expectedUpdatedAt: revision })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
  it("cancels before dispatch and ignores the cancelled entry", async () => {
    await change(); await change({ action: "cancel" }); await consume();
    expect(delivery().state).toBe("cancelled");
  });
  it("rejects copy changed outside the editor after scheduling", async () => {
    await change(); post.caption = "Newer copy"; await consume();
    expect(delivery().state).toBe("cancelled");
  });
  it("does not execute early", async () => {
    await change();
    await consumePostDelivery({ client, postId: "post", userId: "author", jobId: delivery().jobId as string, simulated: true, now: Date.now() });
    expect(delivery().state).toBe("scheduled");
  });
  it("retry after enqueue failure keeps the immutable snapshot and job id", async () => {
    enqueue.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(change()).rejects.toThrow(/queue/i);
    const original = { ...delivery() };
    await change({ action: "retry" }); await consume();
    expect(delivery()).toMatchObject({ jobId: original.jobId, text: original.text, state: "simulated" });
  });
  it("blocks retry of an uncertain journal even in local simulation", async () => {
    await change(); delivery().state = "uncertain"; delivery().dispatched = true;
    await expect(change({ action: "retry" })).rejects.toThrow(/uncertain/i);
  });
  it("cannot promote a journal to a live delivery", async () => {
    await change();
    await expect(consumePostDelivery({ client, postId: "post", userId: "author", jobId: delivery().jobId as string, simulated: false })).rejects.toThrow(/local development simulation/i);
    expect(delivery().state).toBe("scheduled");
  });
  it("concurrent consumers and cancellation yield one terminal outcome", async () => {
    await change();
    await Promise.allSettled([consume(), consume(), change({ action: "cancel" })]);
    expect(["simulated", "cancelled"]).toContain(delivery().state);
    const revision = post.updated_at; await consume(); expect(post.updated_at).toBe(revision);
  });
  it("recovers a lost final receipt on replay without claiming completion early", async () => {
    await change(); failReceipt = true;
    await expect(consume()).rejects.toThrow(/save/i);
    expect(delivery().state).toBe("processing");
    await expect(consume()).rejects.toThrow(/save/i);
    failReceipt = false; await consume();
    expect(delivery().state).toBe("simulated");
    const revision = post.updated_at; await consume(); expect(post.updated_at).toBe(revision);
  });
  it("explicitly completes only the current interrupted local job without enqueue", async () => {
    await change(); failReceipt = true; await expect(consume()).rejects.toThrow(/save/i); failReceipt = false;
    const jobId = delivery().jobId;
    await expect(change({ action: "recover", expectedUpdatedAt: "stale" })).rejects.toThrow(/changed/i);
    await change({ action: "recover" });
    expect(delivery()).toMatchObject({ state: "simulated", jobId }); expect(enqueue).toHaveBeenCalledTimes(1);
    await expect(change({ action: "recover" })).rejects.toThrow(/interrupted/i);
  });
  it("refuses explicit recovery if the saved copy or journal is unsafe", async () => {
    await change(); failReceipt = true; await expect(consume()).rejects.toThrow(/save/i); failReceipt = false;
    delivery().dispatched = true; await expect(change({ action: "recover" })).rejects.toThrow(/uncertain/i);
    delivery().dispatched = false; delivery().simulated = false; await expect(change({ action: "recover" })).rejects.toThrow(/local simulation/i);
    delivery().simulated = true; post.caption = "Newer copy"; await expect(change({ action: "recover" })).rejects.toThrow(/changed/i);
    expect(delivery().state).toBe("processing");
  });
  it("does not recover a processing journal marked dispatched or belonging to another job", async () => {
    await change(); failReceipt = true; await expect(consume()).rejects.toThrow(/save/i); failReceipt = false;
    await consumePostDelivery({ client, postId: "post", userId: "author", jobId: "wrong", simulated: true });
    expect(delivery().state).toBe("processing"); delivery().dispatched = true;
    await expect(consume()).rejects.toThrow(/uncertain/i); expect(delivery().state).toBe("processing");
  });
  it("does not process without persisting its claim", async () => {
    await change(); failSave = true; await expect(consume()).rejects.toThrow(/save/i);
    expect(delivery().state).toBe("scheduled");
  });
  it("does not consume a different job or account", async () => {
    await change();
    await consumePostDelivery({ client, postId: "post", userId: "other", jobId: delivery().jobId as string, simulated: true });
    await consumePostDelivery({ client, postId: "post", userId: "author", jobId: "forged-job", simulated: true });
    expect(delivery().state).toBe("scheduled");
  });
});
