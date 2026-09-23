// PostHog server-side capture. Designed so:
//   1. The module loads even when POSTHOG_API_KEY is unset (returns a no-op client).
//   2. A single PostHog instance is reused across requests.
//   3. Errors during capture never break the request — analytics must not be a
//      reliability dependency.
//
// Wire-up: import `capturePostHog` at any server component, server action, or
// API route. Page-view events are emitted by the client provider in the
// browser; this module is for explicit server-side events (sign-in, sign-up,
// book_opened).
//
// Sprint 0 scope: instrumentation only. No retention or A/B logic here.

import { PostHog } from "posthog-node";

type CaptureInput = {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
};

let cached: PostHog | null = null;
let cachedEnabled: boolean | null = null;

function isEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  cachedEnabled = Boolean(process.env.POSTHOG_API_KEY);
  return cachedEnabled;
}

function getClient(): PostHog | null {
  if (!isEnabled()) return null;
  if (cached) return cached;

  const apiKey = process.env.POSTHOG_API_KEY ?? "";
  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";

  cached = new PostHog(apiKey, {
    host,
    flushAt: 1,
    flushInterval: 0,
  });
  return cached;
}

/**
 * Fire-and-forget server-side event capture. Never throws.
 * Use awaitable variant `capturePostHogAsync` if you need to ensure delivery
 * before the request completes (e.g. before a redirect).
 */
export function capturePostHog(input: CaptureInput): void {
  try {
    const client = getClient();
    if (!client) return;
    client.capture({
      distinctId: input.distinctId,
      event: input.event,
      properties: input.properties,
    });
  } catch {
    // Analytics must never propagate.
  }
}

/**
 * Awaitable variant. Flushes synchronously (within reason) so a serverless
 * function does not exit before the event is sent.
 */
export async function capturePostHogAsync(input: CaptureInput): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    client.capture({
      distinctId: input.distinctId,
      event: input.event,
      properties: input.properties,
    });
    await client.flush();
  } catch {
    // Analytics must never propagate.
  }
}
