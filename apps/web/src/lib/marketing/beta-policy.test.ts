import { afterEach, expect, it, vi } from "vitest";
import { isSocialPublishingEnabled } from "./beta-policy";
afterEach(() => vi.unstubAllEnvs());
it("opening marketing or social connections cannot enable public posting", () => {
  vi.stubEnv("NEXT_PUBLIC_MARKETING_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SOCIAL_ENABLED", "true");
  vi.stubEnv("SOCIAL_ENABLED", "true");
  expect(isSocialPublishingEnabled()).toBe(false);
});
