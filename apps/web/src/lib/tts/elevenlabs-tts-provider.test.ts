import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsTtsProvider } from "./elevenlabs-tts-provider";

const recordUsageMock = vi.fn();
vi.mock("@/lib/usage/meter", () => ({
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
}));

const originalFetch = globalThis.fetch;
const ORIGINAL_ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ORIGINAL_ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ORIGINAL_ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID;
const ORIGINAL_ELEVENLABS_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT;

describe("ElevenLabsTtsProvider", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "super-secret-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-env";
    process.env.ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
    process.env.ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (typeof ORIGINAL_ELEVENLABS_API_KEY === "undefined") delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = ORIGINAL_ELEVENLABS_API_KEY;

    if (typeof ORIGINAL_ELEVENLABS_VOICE_ID === "undefined") delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = ORIGINAL_ELEVENLABS_VOICE_ID;

    if (typeof ORIGINAL_ELEVENLABS_MODEL_ID === "undefined") delete process.env.ELEVENLABS_MODEL_ID;
    else process.env.ELEVENLABS_MODEL_ID = ORIGINAL_ELEVENLABS_MODEL_ID;

    if (typeof ORIGINAL_ELEVENLABS_OUTPUT_FORMAT === "undefined") delete process.env.ELEVENLABS_OUTPUT_FORMAT;
    else process.env.ELEVENLABS_OUTPUT_FORMAT = ORIGINAL_ELEVENLABS_OUTPUT_FORMAT;
  });

  it("calls ElevenLabs API and returns mp3 buffer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Uint8Array.from([1, 2, 3, 4]).buffer),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ElevenLabsTtsProvider();
    const result = await provider.synthesize("Hej världen", {
      language: "sv",
      voiceId: "voice-from-options",
      modelId: "model-from-options",
      timeoutMs: 1_000,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-from-options");
    expect(options.method).toBe("POST");

    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      text: "Hej världen",
      model_id: "model-from-options",
      output_format: "mp3_44100_128",
    });

    expect(result.format).toBe("mp3");
    expect(result.bitrateKbps).toBe(128);
    expect(Buffer.isBuffer(result.wav)).toBe(true);
    expect(result.wav.length).toBe(4);
  });

  it("throws concise error without leaking api key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("unauthorized"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ElevenLabsTtsProvider();

    try {
      await provider.synthesize("Hej", {
        language: "sv",
        voiceId: "voice-from-options",
        modelId: "model-from-options",
        timeoutMs: 1_000,
      });
      throw new Error("Expected synthesize to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("ElevenLabs TTS API error 401");
      expect(message).not.toContain("super-secret-key");
    }
  });
});

describe("ElevenLabsTtsProvider metering", () => {
  const savedFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = "super-secret-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-env";
    process.env.ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
    process.env.ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(128),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  it("records characters sent, which is the unit ElevenLabs bills", async () => {
    const text = "a".repeat(8_120);
    await new ElevenLabsTtsProvider().synthesize(text, {
      language: "sv",
      voiceId: "voice-1",
      modelId: "eleven_multilingual_v2",
      timeoutMs: 1_000,
      meter: { userId: "user-1", pipeline: "tts", bookId: "book-1" },
    });
    const [ctx, events] = recordUsageMock.mock.calls[0];
    expect(ctx).toMatchObject({ userId: "user-1", pipeline: "tts", bookId: "book-1" });
    expect(events).toEqual([
      {
        kind: "ai_call",
        provider: "elevenlabs",
        model: "eleven_multilingual_v2",
        quantity: 8_120,
        unit: "chars",
      },
    ]);
  });

  it("records nothing when no meter context is supplied", async () => {
    await new ElevenLabsTtsProvider().synthesize("hej", {
      language: "sv",
      voiceId: "voice-1",
      modelId: "eleven_multilingual_v2",
      timeoutMs: 1_000,
    });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("does not record anything when the request fails, since nothing was billed", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    })) as unknown as typeof fetch;
    await expect(
      new ElevenLabsTtsProvider().synthesize("hej", {
        language: "sv",
        voiceId: "voice-1",
        modelId: "eleven_multilingual_v2",
        timeoutMs: 1_000,
        meter: { userId: "user-1", pipeline: "tts" },
      })
    ).rejects.toThrow();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});
