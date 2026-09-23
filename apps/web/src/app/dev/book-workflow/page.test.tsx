import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./WorkflowPreview", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());

describe("book workflow UI fixture", () => {
  it("cannot be opened in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => Page()).toThrow("NOT_FOUND");
  });
  it("is available only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(Page()).toBeTruthy();
  });
});
