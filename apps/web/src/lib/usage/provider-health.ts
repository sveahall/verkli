/**
 * Does each configured AI provider key actually work?
 *
 * Exists because "set" and "valid" are different things, and the codebase only
 * ever checked the first. `isOpenAiConfigured()` returns true for any non-blank
 * string, and every caller treats a provider failure as "degrade quietly" — so
 * a mistyped key produces no error anywhere. Production ran with an
 * `OPENAI_API_KEY` carrying one extra leading character: 401 on every call, the
 * editorial critic silently skipped, authors billed for the half of the pass
 * that did run. Nothing in the repo could have caught that.
 *
 * Each probe is the cheapest authenticated call the vendor offers, and none of
 * them generate anything billable.
 */
export type ProviderProbe = {
  provider: string;
  envVar: string;
  configured: boolean;
  ok: boolean;
  status: number | null;
  detail: string;
  /** Key is valid but lacks the permission this probe needed. Not a fault. */
  scoped?: boolean;
};

/**
 * Only 401 and 403 mean the vendor rejected our identity. Any other status —
 * 422 on a deliberately minimal body, 404 on an endpoint that moved — means the
 * request got past auth, which is the only thing being asked here.
 */
function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * A scoped key that lacks a read permission is correctly configured for what it
 * is allowed to do. ElevenLabs returns 401 for this, which looks identical to a
 * bad key until you read the body — probing `/v1/voices` with a TTS-only key
 * reports a working audiobook pipeline as broken.
 */
function isScopeError(body: string): boolean {
  return /missing the permission|insufficient_permissions|requires the .* permission/i.test(body);
}

const TIMEOUT_MS = 10_000;

async function probe(
  provider: string,
  envVar: string,
  run: (key: string) => Promise<Response>
): Promise<ProviderProbe> {
  const key = process.env[envVar]?.trim();
  if (!key) {
    return { provider, envVar, configured: false, ok: true, status: null, detail: "not configured — skipped" };
  }
  try {
    const res = await run(key);
    if (res.ok) {
      return { provider, envVar, configured: true, ok: true, status: res.status, detail: "key accepted" };
    }

    const body = await res.text().catch(() => "");
    if (!isAuthFailure(res.status)) {
      return {
        provider,
        envVar,
        configured: true,
        ok: true,
        status: res.status,
        detail: `key accepted (HTTP ${res.status} on the probe body, not on auth)`,
      };
    }
    if (isScopeError(body)) {
      return {
        provider,
        envVar,
        configured: true,
        ok: true,
        scoped: true,
        status: res.status,
        detail: "key valid but scoped — lacks the permission this probe reads",
      };
    }
    return {
      provider,
      envVar,
      configured: true,
      ok: false,
      status: res.status,
      detail: `rejected with HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      provider,
      envVar,
      configured: true,
      ok: false,
      status: null,
      detail: `probe failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function probeAllProviders(): Promise<ProviderProbe[]> {
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  return Promise.all([
    probe("openai", "OPENAI_API_KEY", (key) =>
      fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: signal(),
      })
    ),
    probe("anthropic", "ANTHROPIC_API_KEY", (key) =>
      fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal: signal(),
      })
    ),
    probe("elevenlabs", "ELEVENLABS_API_KEY", (key) =>
      fetch("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": key },
        signal: signal(),
      })
    ),
    probe("fal", "FAL_KEY", (key) =>
      fetch("https://rest.alpha.fal.ai/tokens/", {
        method: "POST",
        headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ allowed_apps: ["fal-ai/flux/schnell"], token_expiration: 60 }),
        signal: signal(),
      })
    ),
  ]);
}

/** A key that is present but rejected. The failure mode nothing else catches. */
export function brokenProviders(probes: ProviderProbe[]): ProviderProbe[] {
  return probes.filter((p) => p.configured && !p.ok);
}
