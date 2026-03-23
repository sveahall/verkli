import { afterEach, describe, expect, it } from "vitest";
import { assertElevenLabsEnv } from "./tts-provider";

const ORIGINAL_ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ORIGINAL_ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

afterEach(() => {
  if (typeof ORIGINAL_ELEVENLABS_API_KEY === "undefined") delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = ORIGINAL_ELEVENLABS_API_KEY;

  if (typeof ORIGINAL_ELEVENLABS_VOICE_ID === "undefined") delete process.env.ELEVENLABS_VOICE_ID;
  else process.env.ELEVENLABS_VOICE_ID = ORIGINAL_ELEVENLABS_VOICE_ID;
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
});
