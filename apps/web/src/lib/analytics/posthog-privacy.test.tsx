import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CaptureResult, PostHogConfig } from "posthog-js";

const mocks = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
const marker = "SYNTHETIC_DOWNLOAD_BEARER";
const path = "/order/ta-for-er/success";

vi.mock("posthog-js", () => ({ default: mocks }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/order/ta-for-er/success",
  useSearchParams: () => new URLSearchParams("session_id=SYNTHETIC_DOWNLOAD_BEARER"),
}));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useEffect: (effect: () => void) => effect(),
}));

async function providerConfig() {
  const { default: Provider } = await import("@/components/analytics/PostHogProvider");
  expect(renderToStaticMarkup(createElement(Provider, null, "Book content"))).toContain("Book content");
  return mocks.init.mock.calls[0][1] as Partial<PostHogConfig>;
}

describe("PostHog purchase URL privacy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "synthetic-analytics-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("tracks the page without passing the download bearer to capture", async () => {
    await providerConfig();
    expect(mocks.capture).toHaveBeenCalledWith("$pageview", { $current_url: path, path });
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(marker);
  });

  it.each(["$pageview", "$pageleave", "$identify"])(
    "removes sensitive URLs from SDK-added %s fields, including stored initial values",
    async (event) => {
      const config = await providerConfig();
      const timestamp = new Date("2026-09-22T12:00:00Z");
      const url = `https://example.invalid${path}?session_id=${marker}#access_token=${marker}`;
      const payload: CaptureResult = {
        uuid: "synthetic-event-id",
        event,
        timestamp,
        properties: {
          $current_url: url,
          $referrer: url,
          $session_entry_url: url,
          path,
          $set: { $initial_referrer: url },
          $set_once: { $initial_current_url: url },
          links: [url, `${path}?session_id=${marker}`],
          count: 3,
        },
        $set_once: { $initial_current_url: url, $initial_referrer: url },
        $set: { $current_url: url },
      };
      const beforeSend = config.before_send;
      const result = typeof beforeSend === "function" ? beforeSend(payload) : payload;
      expect(JSON.stringify(result)).not.toContain(marker);
      expect(result?.timestamp).toBe(timestamp);
      expect(result?.event).toBe(event);
      expect(result?.properties).toMatchObject({ path, count: 3, $current_url: `https://example.invalid${path}` });
      expect(payload.properties.$current_url).toBe(url);
    },
  );

  it("disables the unused flags transport that bypasses before_send", async () => {
    const config = await providerConfig();
    expect(config.advanced_disable_flags).toBe(true);
    expect(config.capture_pageleave).toBe(true);
  });

  it("renders content without initializing analytics when no key is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { default: Provider } = await import("@/components/analytics/PostHogProvider");
    expect(renderToStaticMarkup(createElement(Provider, null, "Book content"))).toContain("Book content");
    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
