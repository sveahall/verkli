import type { CaptureResult } from "posthog-js";

function sanitizeUrls(value: unknown): unknown {
  if (typeof value === "string" && /^(https?:\/\/|\/)/i.test(value)) {
    // Checkout URLs carry download credentials. Keep origin/path for analytics,
    // never query strings or fragments, including previously persisted URLs.
    return value.split(/[?#]/, 1)[0];
  }
  if (Array.isArray(value)) return value.map(sanitizeUrls);
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, sanitizeUrls(entry)]),
      );
    }
  }
  return value;
}

/** Covers SDK-added URLs in events, person properties and session attribution. */
export function sanitizePostHogEvent(event: CaptureResult | null): CaptureResult | null {
  return sanitizeUrls(event) as CaptureResult | null;
}
