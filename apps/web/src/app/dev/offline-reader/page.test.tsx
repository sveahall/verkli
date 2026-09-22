import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("./OfflineReaderPreview", () => ({ default: () => null }));
import Page from "./page";
afterEach(() => vi.unstubAllEnvs());
describe("offline reader preview", () => {
  it("is not available in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => Page()).toThrow("NEXT_NOT_FOUND");
  });
  it("renders the local fixture only during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(Page()).toBeTruthy();
  });
});
