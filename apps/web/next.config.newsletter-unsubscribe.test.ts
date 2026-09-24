import { expect, it, vi } from "vitest";
import type { NextConfig } from "next";
import { unsubscribePage } from "./src/lib/newsletters/unsubscribe-page";

vi.mock("@sentry/nextjs", () => ({ withSentryConfig: (config: NextConfig) => config }));
vi.mock("@next/bundle-analyzer", () => ({ default: () => (config: NextConfig) => config }));
vi.mock("next-intl/plugin", () => ({ default: () => (config: NextConfig) => config }));
const { default: config } = await import("./next.config");

it.each(["/api/newsletters/unsubscribe", "/dev/newsletter-unsubscribe"])("keeps private document headers after global headers on exact %s", async path => {
  const rules = await config.headers!();
  const globalIndex = rules.findIndex(rule => rule.source === "/(.*)");
  const privateIndex = rules.findIndex(rule => rule.source === path);
  expect(privateIndex).toBeGreaterThan(globalIndex);
  const headers = Object.fromEntries(rules[privateIndex].headers.map(({ key, value }) => [key.toLowerCase(), value]));
  const documentHeaders = unsubscribePage("confirm").headers;
  for (const name of ["content-security-policy", "referrer-policy", "cache-control", "x-robots-tag"]) {
    expect(headers[name]).toBe(documentHeaders.get(name));
  }
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["content-security-policy"]).toContain("default-src 'none'");
  expect(rules[globalIndex].headers.find(header => header.key === "Referrer-Policy")?.value).toBe("strict-origin-when-cross-origin");
});
