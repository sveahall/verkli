import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_SETTINGS,
  MAX_INSTRUCTIONS_CHARS,
  MAX_NICKNAME_CHARS,
  parseAiSettingsForm,
} from "./contracts";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const complete = {
  ai_enabled: "true",
  ai_memory_enabled: "true",
  ai_reply_style: "candid",
  ai_warmth: "less",
  ai_enthusiasm: "standard",
  ai_structure: "more",
  ai_emoji: "less",
  ai_match_writing_voice: "true",
  ai_nickname: "Svea",
  ai_craft: "Historical fiction",
  ai_about: "I write for readers who already know the period.",
  ai_instructions: "Never rewrite dialogue.",
};

describe("AI settings form contract", () => {
  it("reads every control off the shared author-settings form", () => {
    const result = parseAiSettingsForm(form(complete));
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      aiEnabled: true,
      memoryEnabled: true,
      replyStyle: "candid",
      warmth: "less",
      enthusiasm: "standard",
      structure: "more",
      emoji: "less",
      matchWritingVoice: true,
      nickname: "Svea",
      craft: "Historical fiction",
      about: "I write for readers who already know the period.",
      instructions: "Never rewrite dialogue.",
    });
  });

  it("treats a missing checkbox as off, because an unchecked box posts nothing", () => {
    const unchecked = Object.fromEntries(
      Object.entries(complete).filter(([key]) => !["ai_enabled", "ai_memory_enabled", "ai_match_writing_voice"].includes(key))
    );
    const result = parseAiSettingsForm(form(unchecked));
    expect(result.success && result.data.aiEnabled).toBe(false);
    expect(result.success && result.data.memoryEnabled).toBe(false);
    expect(result.success && result.data.matchWritingVoice).toBe(false);
  });

  it("falls back to defaults when a select is absent rather than failing the whole save", () => {
    const result = parseAiSettingsForm(form({ ai_enabled: "true" }));
    expect(result.success && result.data.replyStyle).toBe(DEFAULT_AI_SETTINGS.replyStyle);
    expect(result.success && result.data.warmth).toBe(DEFAULT_AI_SETTINGS.warmth);
  });

  it("rejects a value that is not one of the offered choices", () => {
    expect(parseAiSettingsForm(form({ ...complete, ai_reply_style: "sarcastic" })).success).toBe(false);
    expect(parseAiSettingsForm(form({ ...complete, ai_warmth: "maximum" })).success).toBe(false);
  });

  it("collapses whitespace in single-line fields but keeps newlines in prose", () => {
    const result = parseAiSettingsForm(form({
      ...complete,
      ai_nickname: "  Svea   Hallinder \n",
      ai_about: "  First line.\n\nSecond line.  ",
    }));
    expect(result.success && result.data.nickname).toBe("Svea Hallinder");
    expect(result.success && result.data.about).toBe("First line.\n\nSecond line.");
  });

  it("enforces the limits the inputs advertise", () => {
    expect(parseAiSettingsForm(form({ ...complete, ai_nickname: "x".repeat(MAX_NICKNAME_CHARS + 1) })).success).toBe(false);
    expect(parseAiSettingsForm(form({ ...complete, ai_instructions: "x".repeat(MAX_INSTRUCTIONS_CHARS + 1) })).success).toBe(false);
  });

  it("keeps personalisation when AI is switched off, so turning it back on restores it", () => {
    const result = parseAiSettingsForm(form({ ...complete, ai_enabled: "false" }));
    expect(result.success && result.data.aiEnabled).toBe(false);
    expect(result.success && result.data.replyStyle).toBe("candid");
    expect(result.success && result.data.instructions).toBe("Never rewrite dialogue.");
  });
});
