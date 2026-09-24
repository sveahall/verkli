import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./ProviderReportPreview", () => ({ default: () => null }));
import Page from "./page";
afterEach(() => vi.unstubAllEnvs());
it.each(["production", "test"])("excludes the provider fixture in %s", env => {
  vi.stubEnv("NODE_ENV", env);
  expect(() => Page()).toThrow("NOT_FOUND");
});
it("allows the synthetic fixture in development", () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(Page()).toBeTruthy();
});
