import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./ImportRetryFixture", () => ({ default: () => null }));
import Page from "./page";
afterEach(() => vi.unstubAllEnvs());
it.each(["production", "test"])("excludes the retry fixture in %s", (mode) => {
  vi.stubEnv("NODE_ENV", mode);
  expect(() => Page()).toThrow("NOT_FOUND");
});
