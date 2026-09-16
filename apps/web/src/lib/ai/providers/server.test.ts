import { describe, expect, it } from "vitest";

import { getTranslatorForPair } from "./server";

describe("getTranslatorForPair", () => {
  it("routes supported Swedish pairs to the Anthropic translator", () => {
    expect(getTranslatorForPair("sv", "en")?.name).toBe("anthropic");
    expect(getTranslatorForPair("en", "sv")?.name).toBe("anthropic");
  });

  it("retains Riva routing and rejects unsupported pairs", () => {
    expect(getTranslatorForPair("en", "fr")?.name).toBe("nvidia-riva");
    expect(getTranslatorForPair("unknown", "sv")).toBeNull();
  });
});
