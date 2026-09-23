import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./AgentTeamPreview", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());

describe("team presentation fixture", () => {
  it("is inaccessible in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => Page()).toThrow("NOT_FOUND");
  });
  it("can be tested locally", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(Page()).toBeTruthy();
  });
});
