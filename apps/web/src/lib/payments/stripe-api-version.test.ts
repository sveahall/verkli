import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { STRIPE_API_VERSION } from "./stripe";

describe("STRIPE_API_VERSION", () => {
  it("matches the version the installed SDK would send on its own", () => {
    // The point of pinning is that `npm update stripe` cannot change the wire
    // format without someone deciding to. If the SDK's compiled-in default moves
    // and this constant does not, that is exactly the moment a human should look
    // at Stripe's changelog — so fail here rather than ship a silent change.
    const sdkDir = dirname(require.resolve("stripe"));
    const raw = readFileSync(join(sdkDir, "apiVersion.js"), "utf8");
    const sdkVersion = raw.match(/'([\d]{4}-[\d]{2}-[\d]{2}\.\w+)'/)?.[1];

    expect(sdkVersion).toBeTruthy();
    expect(STRIPE_API_VERSION).toBe(sdkVersion);
  });

  it("is a real Stripe version string, not a placeholder", () => {
    expect(STRIPE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.[a-z]+$/);
  });
});

describe("raw Stripe REST calls", () => {
  const originalFetch = global.fetch;
  let seenHeaders: Record<string, string> = {};

  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_pinning");
    seenHeaders = {};
    global.fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      seenHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ id: "cs_test", url: "https://x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("sends Stripe-Version, because a raw fetch otherwise rides the account default", async () => {
    // The SDK clients pin themselves once constructed. These do not: without an
    // explicit header Stripe applies whatever version the ACCOUNT is set to,
    // which can move with no deploy on our side.
    const { getStripeCheckoutSession } = await import("./stripe");
    await getStripeCheckoutSession("cs_test_123").catch(() => undefined);

    expect(seenHeaders["Stripe-Version"]).toBe(STRIPE_API_VERSION);
  });
});
