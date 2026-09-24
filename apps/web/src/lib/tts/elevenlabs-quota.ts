/**
 * Remaining ElevenLabs credits, read before an audiobook is paid for.
 *
 * Why this exists: the length cap (TTS_JOB_CAP_CHARS) bounds how big a job may
 * be, but it says nothing about whether the account can still pay for it. Those
 * are different limits and they fail in the same expensive place — the worker,
 * after Stripe has taken 299 SEK, with the paid session no longer retryable
 * because the client strips session_id from the redirect.
 *
 * A real failure of exactly this shape, 2026-09-01:
 *
 *   ElevenLabs TTS API error 401: quota_exceeded — "This request exceeds your
 *   API key (verkli-worker-audiobook) quota of 5000. You have 1836 credits
 *   remaining, while 3947 credits are required for this request."
 *
 * That job happened to be a PRO author rather than a one-time payer, so no money
 * was lost. That was luck, not design.
 *
 * Note the quota that bit there was a **per-API-key** limit, well below the
 * account's own balance. `/v1/user/subscription` reports the account, so a key
 * capped tighter than the account can still fail after this check passes. Keep
 * per-key limits at or above the account limit, or this guard is optimistic.
 */

const SUBSCRIPTION_URL = "https://api.elevenlabs.io/v1/user/subscription";
const TIMEOUT_MS = 5_000;

export type QuotaSnapshot = {
  /** Credits still available on the account, or null when unknown. */
  remaining: number | null;
  /** Why `remaining` is null. Absent on success. */
  reason?: "no_api_key" | "request_failed" | "unexpected_shape" | "missing_permission";
};

function parseCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Reads the account's remaining credits. Never throws: callers decide what an
 * unknown quota should mean, and that decision differs by caller.
 */
export async function getRemainingCredits(): Promise<QuotaSnapshot> {
  const apiKey = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!apiKey) return { remaining: null, reason: "no_api_key" };

  let payload: unknown;
  try {
    const res = await fetch(SUBSCRIPTION_URL, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      // A scoped key is the likeliest cause and the least obvious one: the key
      // works for synthesis and 401s only here, so the audiobook flow refuses
      // every purchase while every other ElevenLabs call succeeds. Production
      // ran in exactly that state on 2026-09-23.
      //
      // Deliberately not papered over with a configured quota: a guard that
      // guesses the balance is worse than one that refuses, because this guard
      // is what stands between a customer and a charge for narration that
      // cannot run.
      const body = await res.text().catch(() => "");
      const missingPermission =
        (res.status === 401 || res.status === 403) && /missing the permission/i.test(body);
      console.warn("[elevenlabs.quota] subscription lookup failed", {
        status: res.status,
        reason: missingPermission
          ? "the API key lacks `user_read` — grant it in the ElevenLabs dashboard"
          : "unexpected response",
      });
      return { remaining: null, reason: missingPermission ? "missing_permission" : "request_failed" };
    }
    payload = await res.json();
  } catch (err) {
    console.warn("[elevenlabs.quota] subscription lookup threw", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { remaining: null, reason: "request_failed" };
  }

  return parseQuotaSnapshot(payload);
}

/** Shared response contract for checkout and the provider health probe. */
export function parseQuotaSnapshot(payload: unknown): QuotaSnapshot {
  if (!payload || typeof payload !== "object") {
    return { remaining: null, reason: "unexpected_shape" };
  }
  const p = payload as Record<string, unknown>;
  const limit = parseCount(p.character_limit);
  const used = parseCount(p.character_count);
  if (limit === null || used === null) {
    return { remaining: null, reason: "unexpected_shape" };
  }

  return { remaining: Math.max(0, limit - used) };
}
