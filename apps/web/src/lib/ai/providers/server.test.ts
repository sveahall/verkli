import { afterEach, describe, expect, it, vi } from "vitest";
import { getTranslatorForPair } from "./server";

afterEach(() => vi.unstubAllEnvs());

describe("server translation provider routing", () => {
  it.each([["en", "sv"], ["sv", "en"], ["sv", "fr"], ["en", "it"]])(
    "provides a translator for %s → %s without local Opus models",
    (source, target) => {
      vi.stubEnv("OPUSMT_ENABLED", "false");
      expect(getTranslatorForPair(source, target)?.name).toBe("anthropic");
    },
  );

  it("keeps the existing Riva route", () => {
    expect(getTranslatorForPair("en", "fr")?.name).toBe("nvidia-riva");
  });

  it("keeps explicitly configured Opus and unsupported pairs unchanged", () => {
    vi.stubEnv("OPUSMT_ENABLED", "true");
    vi.stubEnv("OPUSMT_PYTHON", "/configured/python");
    vi.stubEnv("OPUSMT_MODELS_DIR", "/configured/models");
    expect(getTranslatorForPair("en", "sv")?.name).toBe("opus-mt");
    expect(getTranslatorForPair("en", "en")).toBeNull();
    expect(getTranslatorForPair("en", "unknown")).toBeNull();
  });
});
