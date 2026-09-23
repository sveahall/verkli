import { describe, expect, it, vi } from "vitest";
import type { NextConfig } from "next";

vi.mock("@sentry/nextjs", () => ({ withSentryConfig: (config: NextConfig) => config }));
vi.mock("@next/bundle-analyzer", () => ({ default: () => (config: NextConfig) => config }));
vi.mock("next-intl/plugin", () => ({ default: () => (config: NextConfig) => config }));
const { default: config } = await import("./next.config");

describe("Stripe onboarding form CSP", () => {
  it("allows the Connect redirect while retaining the existing form destinations", async () => {
    const headers = await config.headers?.();
    const csp = headers?.find((rule) => rule.source === "/(.*)")?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
    expect(csp?.split("; ").find((directive) => directive.startsWith("form-action "))?.split(" ")).toEqual([
      "form-action", "'self'", "https://checkout.stripe.com", "https://billing.stripe.com", "https://connect.stripe.com", "https://*.supabase.co",
    ]);
  });
});
