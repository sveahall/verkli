import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./DemoCandidate", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());
it.each(["production", "test"] as const)("excludes picker fixture in %s", async (value) => { vi.stubEnv("NODE_ENV", value); await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND"); });
it("does not open a chapter from a different selected edition", async () => {
  vi.stubEnv("NODE_ENV", "development");
  await expect(Page({ searchParams: Promise.resolve({ book: "00000000-0000-4000-8000-000000000001", edition: "00000000-0000-4000-8000-000000000005", chapter: "00000000-0000-4000-8000-000000000003" }) })).rejects.toThrow("NOT_FOUND");
});
