import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./AudiobookPreview", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());

describe("audiobook UI fixture", () => {
  it.each(["production", "test"] as const)("cannot be opened in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => Page()).toThrow("NOT_FOUND");
  });

  it("is available in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(Page()).toBeTruthy();
  });
});
