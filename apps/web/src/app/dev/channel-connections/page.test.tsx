import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./ChannelConnectionsPreview", () => ({ default: () => null }));
const { default: Page } = await import("./page");
afterEach(() => vi.unstubAllEnvs());
describe("channel connections fixture gate", () => {
  it.each(["production", "test"])("is unavailable in %s", environment => {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => Page()).toThrow("NOT_FOUND");
  });
  it("is available only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(Page()).toBeTruthy();
  });
});
