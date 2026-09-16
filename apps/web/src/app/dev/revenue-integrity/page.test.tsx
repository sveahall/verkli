import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./RevenueIntegrityPreview", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());
describe("revenue fixture isolation", () => {
  it.each(["production", "test"] as const)("is unavailable in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => Page()).toThrow("NOT_FOUND");
  });
  it("is available locally", () => { vi.stubEnv("NODE_ENV", "development"); expect(Page()).toBeTruthy(); });
});
