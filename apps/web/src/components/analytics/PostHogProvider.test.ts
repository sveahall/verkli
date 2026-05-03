import { afterEach, describe, expect, it, vi } from "vitest";

const posthogClient = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/reader",
  useSearchParams: () => new URLSearchParams("ref=test"),
}));

vi.mock("posthog-js", () => ({
  default: posthogClient,
}));

const originalPostHogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const originalPostHogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

async function loadInitPostHogOnce() {
  vi.resetModules();
  const providerModule = await import("./PostHogProvider");
  return providerModule.initPostHogOnce;
}

describe("initPostHogOnce", () => {
  afterEach(() => {
    posthogClient.init.mockReset();
    posthogClient.capture.mockReset();
    vi.unstubAllGlobals();
    vi.resetModules();

    if (originalPostHogKey === undefined) {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    } else {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = originalPostHogKey;
    }

    if (originalPostHogHost === undefined) {
      delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    } else {
      process.env.NEXT_PUBLIC_POSTHOG_HOST = originalPostHogHost;
    }
  });

  it("initializes PostHog once and reuses the lazy client", async () => {
    vi.stubGlobal("window", {});
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.posthog.test";

    const initPostHogOnce = await loadInitPostHogOnce();

    const [firstClient, secondClient] = await Promise.all([initPostHogOnce(), initPostHogOnce()]);

    expect(firstClient).toBe(posthogClient);
    expect(secondClient).toBe(posthogClient);
    expect(posthogClient.init).toHaveBeenCalledTimes(1);
    expect(posthogClient.init).toHaveBeenCalledWith(
      "ph_test",
      expect.objectContaining({
        api_host: "https://eu.posthog.test",
        autocapture: false,
        capture_pageleave: true,
        capture_pageview: false,
        disable_session_recording: true,
        persistence: "localStorage",
      })
    );
  });

  it("retries after a failed PostHog init", async () => {
    vi.stubGlobal("window", {});
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test";
    posthogClient.init.mockImplementationOnce(() => {
      throw new Error("transient init failure");
    });

    const initPostHogOnce = await loadInitPostHogOnce();

    await expect(initPostHogOnce()).resolves.toBeNull();
    await expect(initPostHogOnce()).resolves.toBe(posthogClient);

    expect(posthogClient.init).toHaveBeenCalledTimes(2);
  });
});
