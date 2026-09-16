import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>, updates: [] as unknown[],
  period: "7d", bookId: "all", fetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useState: (initial: unknown) => [initial === "30d" ? harness.period : initial, (value: unknown) => harness.updates.push(value)],
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/author/analytics", useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams(harness.bookId === "all" ? "" : `bookId=${harness.bookId}`) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/features/author-shell/workspace-state", () => ({ useAuthorWorkspace: () => ({ setCurrentBookId: vi.fn() }) }));
vi.mock("@/features/author-workspaces/WorkspaceLayout", () => ({ default: () => null }));
vi.mock("@/features/author-workspaces/components/WorkspaceHeaderActions", () => ({ default: () => null }));
const { default: AnalyticsWorkspace } = await import("./AnalyticsWorkspace");
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
beforeEach(() => {
  harness.effects = []; harness.updates = []; harness.period = "7d"; harness.bookId = "all";
  harness.fetch.mockReset().mockImplementation(async (url: string) => Response.json(url.includes("revenue") ? { byCurrency: { SEK: 150 } } : { books: [] }));
  vi.stubGlobal("fetch", harness.fetch);
});
afterEach(() => vi.unstubAllGlobals());
function start() {
  AnalyticsWorkspace({ books: [{ id: "book-2", title: "Selected" }] });
  return harness.effects.at(-1)!();
}
describe("analytics request integrity", () => {
  it("passes the selected period to the revenue request", async () => {
    start(); await settle();
    expect(harness.fetch.mock.calls.map(([url]) => url)).toContain("/api/author/stats/revenue?period=7d");
  });
  it("passes the selected book as well as period to revenue", async () => {
    harness.bookId = "book-2"; start(); await settle();
    expect(harness.fetch.mock.calls.map(([url]) => url)).toContain("/api/author/stats/revenue?period=7d&bookId=book-2");
  });
  it("clears previous financial figures on a network failure", async () => {
    harness.fetch.mockRejectedValue(new Error("network unavailable"));
    start(); await settle();
    expect(harness.updates).toContainEqual(expect.objectContaining({ revenue: null, booksFailed: true }));
  });
  it("aborts obsolete requests and never applies their response", async () => {
    let resolve!: (value: Response) => void;
    harness.fetch.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    const cleanup = start();
    expect(typeof cleanup).toBe("function");
    if (typeof cleanup === "function") cleanup();
    expect(harness.fetch.mock.calls[0][1]?.signal.aborted).toBe(true);
    resolve(Response.json({ totalRevenue: 999 })); await settle();
    expect(harness.updates.filter((value) => value && typeof value === "object")).toEqual([]);
  });
});
