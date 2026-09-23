import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./Preview", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());
it.each(["production", "test"] as const)("hides recovery fixture in %s", (env) => {
  vi.stubEnv("NODE_ENV", env);
  expect(() => Page()).toThrow("NOT_FOUND");
});
it("allows the development fixture", () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(Page()).toBeTruthy();
});
