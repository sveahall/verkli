import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRequestBaseUrl } from "./request-url";

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("getRequestBaseUrl", () => {
  const saved = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved;
  });

  it("uses a configured custom domain and strips a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://verkli.com/";
    expect(getRequestBaseUrl(req("https://anything.example/api/x"))).toBe(
      "https://verkli.com"
    );
  });

  it("IGNORES a *.vercel.app site URL and uses the live forwarded host", () => {
    // Regression: a stale verkli.vercel.app alias 404'd buyers after payment.
    process.env.NEXT_PUBLIC_SITE_URL = "https://verkli.vercel.app";
    const url = getRequestBaseUrl(
      req("https://internal/api/order", {
        "x-forwarded-host": "verkli-demo.vercel.app",
        "x-forwarded-proto": "https",
      })
    );
    expect(url).toBe("https://verkli-demo.vercel.app");
  });

  it("uses the forwarded host when no site URL is configured", () => {
    const url = getRequestBaseUrl(
      req("https://internal/api/order", {
        "x-forwarded-host": "live-deploy.vercel.app",
      })
    );
    expect(url).toBe("https://live-deploy.vercel.app");
  });

  it("falls back to the host header, then the request origin", () => {
    expect(
      getRequestBaseUrl(req("https://internal/api/x", { host: "h.example" }))
    ).toBe("https://h.example");
    expect(getRequestBaseUrl(req("http://localhost:3000/api/x"))).toBe(
      "http://localhost:3000"
    );
  });

  it("ignores a malformed or non-http site URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-url";
    expect(
      getRequestBaseUrl(req("https://internal/api/x", { host: "fallback.example" }))
    ).toBe("https://fallback.example");
  });
});
