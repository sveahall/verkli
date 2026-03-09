import { afterEach, describe, expect, it } from "vitest";
import { getActiveProviderKey } from "./tts-provider";

const ORIGINAL_TTS_PROVIDER = process.env.TTS_PROVIDER;
const ORIGINAL_ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ORIGINAL_ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

afterEach(() => {
  if (typeof ORIGINAL_TTS_PROVIDER === "undefined") delete process.env.TTS_PROVIDER;
  else process.env.TTS_PROVIDER = ORIGINAL_TTS_PROVIDER;

  if (typeof ORIGINAL_ELEVENLABS_API_KEY === "undefined") delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = ORIGINAL_ELEVENLABS_API_KEY;

  if (typeof ORIGINAL_ELEVENLABS_VOICE_ID === "undefined") delete process.env.ELEVENLABS_VOICE_ID;
  else process.env.ELEVENLABS_VOICE_ID = ORIGINAL_ELEVENLABS_VOICE_ID;
});

describe("getActiveProviderKey", () => {
  it("chooses elevenlabs when TTS_PROVIDER=elevenlabs", () => {
    process.env.TTS_PROVIDER = "elevenlabs";
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-123";

    expect(getActiveProviderKey()).toBe("elevenlabs");
  });
});
