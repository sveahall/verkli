import { afterEach, describe, expect, it } from "vitest";
import { assertElevenLabsEnv, resolveNarratorVoiceId } from "./tts-provider";

const ORIGINAL_ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ORIGINAL_ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ORIGINAL_TTS_VOICE_ID = process.env.TTS_VOICE_ID;

afterEach(() => {
  if (typeof ORIGINAL_ELEVENLABS_API_KEY === "undefined") delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = ORIGINAL_ELEVENLABS_API_KEY;

  if (typeof ORIGINAL_ELEVENLABS_VOICE_ID === "undefined") delete process.env.ELEVENLABS_VOICE_ID;
  else process.env.ELEVENLABS_VOICE_ID = ORIGINAL_ELEVENLABS_VOICE_ID;

  if (typeof ORIGINAL_TTS_VOICE_ID === "undefined") delete process.env.TTS_VOICE_ID;
  else process.env.TTS_VOICE_ID = ORIGINAL_TTS_VOICE_ID;
});

describe("assertElevenLabsEnv", () => {
  it("passes when both env vars are set", () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-123";

    expect(() => assertElevenLabsEnv()).not.toThrow();
  });

  it("throws when ELEVENLABS_API_KEY is missing", () => {
    delete process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_VOICE_ID = "voice-123";

    expect(() => assertElevenLabsEnv()).toThrow("ELEVENLABS_API_KEY");
  });

  // Regression: the worker resolves ELEVENLABS_VOICE_ID || payload.voiceId, and the
  // generate route accepts TTS_VOICE_ID and persists the winner onto the job.
  // Asserting on the env var alone rejected jobs the route had already charged for.
  it("accepts a resolved voice id when ELEVENLABS_VOICE_ID is unset", () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    delete process.env.ELEVENLABS_VOICE_ID;

    expect(() => assertElevenLabsEnv("voice-from-job-payload")).not.toThrow();
  });

  it("still throws when neither the env var nor a resolved voice is available", () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    delete process.env.ELEVENLABS_VOICE_ID;

    expect(() => assertElevenLabsEnv("")).toThrow("ELEVENLABS_VOICE_ID");
    expect(() => assertElevenLabsEnv(null)).toThrow("ELEVENLABS_VOICE_ID");
    expect(() => assertElevenLabsEnv()).toThrow("ELEVENLABS_VOICE_ID");
  });

  it("does not accept a blank resolved voice as configuration", () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    delete process.env.ELEVENLABS_VOICE_ID;

    expect(() => assertElevenLabsEnv("   ")).toThrow("ELEVENLABS_VOICE_ID");
  });
});

describe("resolveNarratorVoiceId", () => {
  it("prefers ELEVENLABS_VOICE_ID", () => {
    process.env.ELEVENLABS_VOICE_ID = "eleven";
    process.env.TTS_VOICE_ID = "tts";

    expect(resolveNarratorVoiceId()).toBe("eleven");
  });

  it("falls through an empty ELEVENLABS_VOICE_ID to TTS_VOICE_ID", () => {
    process.env.ELEVENLABS_VOICE_ID = "";
    process.env.TTS_VOICE_ID = "tts";

    expect(resolveNarratorVoiceId()).toBe("tts");
  });

  it("returns null when nothing is configured, so callers refuse up front", () => {
    delete process.env.ELEVENLABS_VOICE_ID;
    delete process.env.TTS_VOICE_ID;

    expect(resolveNarratorVoiceId()).toBeNull();
  });
});
