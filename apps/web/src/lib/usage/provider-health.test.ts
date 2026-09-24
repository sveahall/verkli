import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { brokenProviders, probeAllProviders, type ProviderProbe } from "./provider-health";

const p = (over: Partial<ProviderProbe> = {}): ProviderProbe => ({
  provider: "openai",
  envVar: "OPENAI_API_KEY",
  configured: true,
  ok: true,
  status: 200,
  detail: "key accepted",
  ...over,
});

describe("brokenProviders", () => {
  it("reports a key that is set but rejected", () => {
    // The exact shape production shipped: present, non-blank, 401 on use.
    const out = brokenProviders([p({ ok: false, status: 401, detail: "rejected with HTTP 401" })]);
    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe("openai");
  });

  it("does not report a provider nobody configured", () => {
    // Not every deployment uses every provider; absent is a choice, not a fault.
    expect(brokenProviders([p({ configured: false, ok: true, status: null })])).toEqual([]);
  });

  it("is quiet when every configured key works", () => {
    expect(brokenProviders([p(), p({ provider: "anthropic" })])).toEqual([]);
  });

  it("reports a probe that could not reach the vendor at all", () => {
    // A network failure is not proof the key is good.
    const out = brokenProviders([p({ ok: false, status: null, detail: "probe failed: timeout" })]);
    expect(out).toHaveLength(1);
  });

  it("reports every broken provider, not just the first", () => {
    const out = brokenProviders([p({ ok: false }), p({ provider: "fal", ok: false })]);
    expect(out.map((x) => x.provider)).toEqual(["openai", "fal"]);
  });
  it("does not report a key the vendor accepted but whose probe body it disliked", () => {
    // fal answers 422 to a deliberately minimal token request. Auth passed;
    // only the payload was wrong, which says nothing about the key.
    expect(brokenProviders([p({ ok: true, status: 422, detail: "key accepted (HTTP 422 on the probe body, not on auth)" })])).toEqual([]);
  });

  it("does not report a valid key that is merely scoped", () => {
    // ElevenLabs returns 401 for a TTS-only key asked to read voices. Probing
    // /v1/voices would otherwise report a working audiobook pipeline as broken.
    const out = brokenProviders([
      p({ provider: "elevenlabs", ok: true, scoped: true, status: 401, detail: "key valid but scoped" }),
    ]);
    expect(out).toEqual([]);
  });
});

describe("the ElevenLabs quota probe", () => {
  beforeEach(() => {
    for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "FAL_KEY"]) {
      vi.stubEnv(name, "");
    }
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["empty body", ""],
    ["truncated JSON", '{"character_limit":100'],
    ["null body", "null"],
    ["array body", "[]"],
    ["missing counts", "{}"],
    ["missing limit", '{"character_count":0}'],
    ["missing count", '{"character_limit":100}'],
    ...["character_limit", "character_count"].flatMap((field) =>
      ["null", '"100"', "true", "-1", "1e400"].map((value) => [
        `${field}=${value}`,
        field === "character_limit"
          ? `{"character_limit":${value},"character_count":0}`
          : `{"character_limit":100,"character_count":${value}}`,
      ])
    ),
  ])("reports HTTP 200 with %s as unreadable", async (_label, body) => {
    vi.mocked(fetch).mockImplementation(async () => new Response(body, { status: 200 }));

    const probes = await probeAllProviders();

    expect(brokenProviders(probes)).toEqual([
      expect.objectContaining({ provider: "elevenlabs-quota", ok: false, status: 200,
        detail: "balance unreadable — invalid quota response" }),
    ]);
    expect(probes.find((probe) => probe.provider === "elevenlabs")?.ok).toBe(true);
  });

  it.each([
    { character_limit: 100, character_count: 20 },
    { character_limit: 0, character_count: 0 },
    { character_limit: 100, character_count: 100 },
    { character_limit: 100, character_count: 250 },
    { character_limit: 100.5, character_count: 0.5 },
  ])("reports valid quota %j as readable, including zero remaining", async (body) => {
    vi.mocked(fetch).mockImplementation(async () => Response.json(body));

    const probes = await probeAllProviders();

    expect(probes.find((probe) => probe.provider === "elevenlabs-quota")).toMatchObject({
      configured: true, ok: true, status: 200, detail: "balance readable",
    });
    expect(brokenProviders(probes)).toEqual([]);
  });

  it("fails the quota check for a scoped response while accepting the synthesis key", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      new Response("missing the permission user_read", { status: 401 })
    );

    const probes = await probeAllProviders();

    expect(brokenProviders(probes).map((probe) => probe.provider)).toEqual(["elevenlabs-quota"]);
    expect(probes.find((probe) => probe.provider === "elevenlabs")).toMatchObject({ ok: true, scoped: true });
  });

  it("skips absent keys without fetching", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    expect(brokenProviders(await probeAllProviders())).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats a scoped key as a FAILURE, unlike every other probe", () => {
    // Synthesis works with a TTS-only key, so every other check passes while
    // `getRemainingCredits` cannot read the balance and checkout refuses every
    // audiobook purchase on an unverifiable quota. Production ran exactly like
    // that on 2026-09-23: elevenlabs "ok (scoped)", elevenlabs-quota broken.
    const out = brokenProviders([
      p({ provider: "elevenlabs", ok: true, scoped: true, status: 401, detail: "key valid but scoped" }),
      p({ provider: "elevenlabs-quota", ok: false, status: 401,
          detail: "key lacks `user_read` — every audiobook purchase will be refused on an unverifiable quota" }),
    ]);
    expect(out.map((x) => x.provider)).toEqual(["elevenlabs-quota"]);
  });

  it("is quiet once the key can read the balance", () => {
    expect(
      brokenProviders([p({ provider: "elevenlabs-quota", ok: true, status: 200, detail: "balance readable" })])
    ).toEqual([]);
  });
});
