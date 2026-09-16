import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, updates: [] as unknown[], fetch: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useState: (initial: unknown) => [initial === "30d" ? "7d" : initial, (value: unknown) => harness.updates.push(value)],
  useCallback: (fn: unknown) => fn,
}));
const { default: AuthorStatsDashboard } = await import("./AuthorStatsDashboard");
const { default: StatsBookTable } = await import("./StatsBookTable");
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
beforeEach(() => {
  harness.effects = []; harness.updates = []; harness.fetch.mockReset().mockImplementation(async () => Response.json({ books: [] }));
  vi.stubGlobal("fetch", harness.fetch);
});
afterEach(() => vi.unstubAllGlobals());
describe("legacy statistics requests", () => {
  it("requests the same revenue period as its selected engagement period", async () => {
    AuthorStatsDashboard(); harness.effects[0](); await settle();
    expect(harness.fetch.mock.calls.map(([url]) => url)).toContain("/api/author/stats/revenue?period=7d");
  });
  it("aborts obsolete dashboard requests on period change or unmount", () => {
    AuthorStatsDashboard(); const cleanup = harness.effects[0]();
    expect(typeof cleanup).toBe("function");
    if (typeof cleanup === "function") cleanup();
    expect(harness.fetch.mock.calls[0][1]?.signal.aborted).toBe(true);
  });
  it("marks failed book purchase statistics as unavailable", async () => {
    harness.fetch.mockResolvedValue(new Response(null, { status: 500 }));
    StatsBookTable({ period: "7d" }); harness.effects[0](); await settle();
    // loading starts true; the additional true after the response is the visible error flag.
    expect(harness.updates.filter((value) => value === true)).toHaveLength(2);
  });
  it("does not let an obsolete book response replace the new period", async () => {
    let resolve!: (response: Response) => void;
    harness.fetch.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    StatsBookTable({ period: "7d" }); const cleanup = harness.effects[0]();
    if (typeof cleanup === "function") cleanup();
    resolve(Response.json({ books: [{ id: "stale", purchases: 999 }] })); await settle();
    expect(harness.updates.some((value) => Array.isArray(value))).toBe(false);
  });
});
