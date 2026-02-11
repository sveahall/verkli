import { describe, it, expect } from "vitest";
import { StubCopywriterProvider } from "./stub-copywriter";

describe("StubCopywriterProvider", () => {
  const provider = new StubCopywriterProvider();

  it("has name 'stub-copywriter'", () => {
    expect(provider.name).toBe("stub-copywriter");
  });

  it("returns valid JSON with expected fields", async () => {
    const result = await provider.generate({
      systemPrompt: "You are a copywriter.",
      userPrompt: "Bok: Nattens skuggor\nBeskrivning: En thriller",
    });

    const parsed = JSON.parse(result.text);
    expect(parsed).toHaveProperty("headline");
    expect(parsed).toHaveProperty("body");
    expect(parsed).toHaveProperty("cta");
    expect(parsed).toHaveProperty("hashtags");
  });

  it("extracts book title from user prompt", async () => {
    const result = await provider.generate({
      systemPrompt: "You are a copywriter.",
      userPrompt: "Bok: Min fantastiska bok\nBeskrivning: Test",
    });

    const parsed = JSON.parse(result.text);
    expect(parsed.headline).toBe("Min fantastiska bok");
  });

  it("falls back to 'Din bok' when title not found", async () => {
    const result = await provider.generate({
      systemPrompt: "System",
      userPrompt: "No title pattern here",
    });

    const parsed = JSON.parse(result.text);
    expect(parsed.headline).toBe("Din bok");
  });

  it("always includes Verkli CTA", async () => {
    const result = await provider.generate({
      systemPrompt: "System",
      userPrompt: "Bok: Test",
    });

    const parsed = JSON.parse(result.text);
    expect(parsed.cta).toContain("Verkli");
  });

  it("reports available models", () => {
    expect(provider.getAvailableModels()).toEqual(["stub"]);
  });
});
