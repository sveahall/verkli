import { describe, expect, it, vi } from "vitest";
import { AIProviderError } from "./types";
import type { TranslatorProvider } from "./types";
import {
  configuredTranslatorNames,
  getTranslatorForPair,
  isTranslationFailoverError,
  runWithTranslationFallback,
} from "./translation-runtime";

function fake(name: string, translate: TranslatorProvider["translate"]): TranslatorProvider {
  return { name, translate, getSupportedPairs: () => [] };
}

describe("configuredTranslatorNames", () => {
  it("lists Anthropic first and OpenAI only when its key is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai");
    expect(configuredTranslatorNames()).toEqual(["anthropic", "openai"]);

    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(configuredTranslatorNames()).toEqual(["openai"]);

    vi.stubEnv("OPENAI_API_KEY", "  ");
    expect(configuredTranslatorNames()).toEqual([]);
    vi.unstubAllEnvs();
  });
});

describe("runWithTranslationFallback", () => {
  it("does not call OpenAI when Anthropic returns a bad reply", async () => {
    const anthropic = fake("anthropic", vi.fn().mockRejectedValue(
      new AIProviderError("Anthropic returned no JSON array.", "MODEL_ERROR", "anthropic")
    ));
    const openai = fake("openai", vi.fn());

    await expect(runWithTranslationFallback([anthropic, openai], (provider) =>
      provider.translate({ text: "hej", sourceLanguage: "sv", targetLanguage: "en" })
    )).rejects.toMatchObject({ code: "MODEL_ERROR" });
    expect(openai.translate).not.toHaveBeenCalled();
  });

  it("uses OpenAI when Anthropic is unreachable", async () => {
    const anthropic = fake("anthropic", vi.fn().mockRejectedValue(
      new AIProviderError("timed out", "TIMEOUT", "anthropic")
    ));
    const openai = fake("openai", vi.fn().mockResolvedValue({ translatedText: "hi" }));

    const result = await runWithTranslationFallback([anthropic, openai], (provider) =>
      provider.translate({ text: "hej", sourceLanguage: "sv", targetLanguage: "en" })
    );
    expect(result).toEqual({ translatedText: "hi" });
    expect(openai.translate).toHaveBeenCalledOnce();
  });

  it("treats overloaded and 5xx as failover, and a bad JSON reply as not", () => {
    expect(isTranslationFailoverError(new AIProviderError("overloaded", "UNKNOWN", "anthropic"))).toBe(true);
    expect(isTranslationFailoverError(new AIProviderError("status 503", "UNKNOWN", "openai"))).toBe(true);
    expect(isTranslationFailoverError(new AIProviderError("no JSON array", "MODEL_ERROR", "anthropic"))).toBe(false);
  });
});

describe("getTranslatorForPair", () => {
  it("refuses a pair the app does not translate, and accepts Danish from English", () => {
    expect(getTranslatorForPair("en", "en")).toBeNull();
    expect(getTranslatorForPair("en", "da")?.name).toBeTypeOf("string");
  });

  it("uses the draft-critique-revise loop when both keys and the critic flag are set", () => {
    vi.stubEnv("AI_CRITIC_ENABLED", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai");
    expect(getTranslatorForPair("sv", "da")?.name).toBe("openai+anthropic");
    vi.unstubAllEnvs();
  });
});
