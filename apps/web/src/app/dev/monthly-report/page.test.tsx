import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./MonthlyReportPreview", () => ({ default: () => null }));
import Page from "./page";
afterEach(() => vi.unstubAllEnvs());
describe("monthly report fixture boundary", () => {
  it.each(["production", "test"])("returns not found in %s", (env) => {
    vi.stubEnv("NODE_ENV", env);
    expect(() => Page()).toThrow("NOT_FOUND");
  });
  it("is available in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(Page()).toBeTruthy();
  });
});
