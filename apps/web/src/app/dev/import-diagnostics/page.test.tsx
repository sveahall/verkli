import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./ImportDiagnosticsPreview", () => ({ default: () => null }));
import Page from "./page";
afterEach(() => vi.unstubAllEnvs());
describe("import diagnostics fixture", () => {
  it.each(["production", "test"])("is hidden in %s", (mode) => { vi.stubEnv("NODE_ENV", mode); expect(() => Page()).toThrow("NOT_FOUND"); });
  it("is development only", () => { vi.stubEnv("NODE_ENV", "development"); expect(Page()).toBeTruthy(); });
});
