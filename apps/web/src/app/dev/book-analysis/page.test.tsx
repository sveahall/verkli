import React from "react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./BookAnalysisPreview", () => ({ default: () => <div>Prepared demo</div> }));
import Page from "./page";
afterEach(() => vi.unstubAllEnvs());
it("never exposes prepared findings as a real production analysis", () => {
  vi.stubEnv("NODE_ENV", "production"); expect(() => Page()).toThrow("NOT_FOUND");
  vi.stubEnv("NODE_ENV", "development"); expect(Page()).toBeTruthy();
});
