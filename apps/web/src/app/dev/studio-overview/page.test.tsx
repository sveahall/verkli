import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./StudioOverviewPreview", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());

describe("studio overview fixture", () => {
  it.each(["production", "test"] as const)("returns 404 in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => Page()).toThrow("NOT_FOUND");
  });

  it("renders in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(Page()).toBeTruthy();
  });
});
