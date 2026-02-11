import { describe, it, expect } from "vitest";
import {
  buildCopywriterSystemPrompt,
  buildCopywriterUserPrompt,
  buildVideoPrompt,
  buildImagePrompt,
} from "./prompt-templates";
import type { BookSnapshot } from "./schemas";

const snapshot: BookSnapshot = {
  title: "Nattens skuggor",
  description: "En thriller om mörka hemligheter",
  language: "sv",
  coverImageUrl: "https://example.com/cover.jpg",
  chapterExcerpt: "Det var en mörk och stormig natt...",
  chapterCount: 12,
};

describe("buildCopywriterSystemPrompt", () => {
  it("includes channel character limits", () => {
    const prompt = buildCopywriterSystemPrompt("ig", "sv");
    expect(prompt).toContain("max 100 characters"); // headline
    expect(prompt).toContain("max 2200 characters"); // body
    expect(prompt).toContain("max 30 hashtags");
  });

  it("specifies Swedish when language is sv", () => {
    const prompt = buildCopywriterSystemPrompt("ig", "sv");
    expect(prompt).toContain("Swedish");
  });

  it("specifies JSON output format", () => {
    const prompt = buildCopywriterSystemPrompt("generic", "en");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("headline");
    expect(prompt).toContain("body");
    expect(prompt).toContain("cta");
  });

  it("says no hashtags for email", () => {
    const prompt = buildCopywriterSystemPrompt("email", "sv");
    expect(prompt).toContain("empty string");
  });
});

describe("buildCopywriterUserPrompt", () => {
  it("includes book title with Bok: prefix", () => {
    const prompt = buildCopywriterUserPrompt(snapshot, "ig");
    expect(prompt).toContain("Bok: Nattens skuggor");
  });

  it("includes description", () => {
    const prompt = buildCopywriterUserPrompt(snapshot, "ig");
    expect(prompt).toContain("Beskrivning: En thriller om mörka hemligheter");
  });

  it("includes tone when provided", () => {
    const prompt = buildCopywriterUserPrompt(snapshot, "ig", "casual");
    expect(prompt).toContain("Ton: casual");
  });

  it("includes addendum when provided", () => {
    const prompt = buildCopywriterUserPrompt(snapshot, "ig", undefined, "Focus on suspense");
    expect(prompt).toContain("Extra instruktioner: Focus on suspense");
  });

  it("omits null fields", () => {
    const minimalSnapshot: BookSnapshot = {
      title: "Test",
      description: null,
      language: "sv",
      coverImageUrl: null,
      chapterExcerpt: null,
      chapterCount: 0,
    };
    const prompt = buildCopywriterUserPrompt(minimalSnapshot, "ig");
    expect(prompt).not.toContain("Beskrivning:");
    expect(prompt).not.toContain("Utdrag:");
  });
});

describe("buildVideoPrompt", () => {
  it("includes book title", () => {
    const prompt = buildVideoPrompt(snapshot, "ig");
    expect(prompt).toContain("Nattens skuggor");
  });

  it("includes no-text instruction", () => {
    const prompt = buildVideoPrompt(snapshot, "tiktok");
    expect(prompt).toContain("Do NOT show any text");
  });

  it("includes channel-specific style hints for tiktok", () => {
    const prompt = buildVideoPrompt(snapshot, "tiktok");
    expect(prompt).toContain("TikTok");
    expect(prompt).toContain("9:16");
  });

  it("includes addendum", () => {
    const prompt = buildVideoPrompt(snapshot, "ig", "Dark mood");
    expect(prompt).toContain("Dark mood");
  });
});

describe("buildImagePrompt", () => {
  it("includes book title", () => {
    const prompt = buildImagePrompt(snapshot, "ig");
    expect(prompt).toContain("Nattens skuggor");
  });

  it("includes no-text instruction", () => {
    const prompt = buildImagePrompt(snapshot, "x");
    expect(prompt).toContain("Do NOT show any text");
  });

  it("includes channel-specific style hints for x", () => {
    const prompt = buildImagePrompt(snapshot, "x");
    expect(prompt).toContain("Landscape");
  });

  it("includes addendum", () => {
    const prompt = buildImagePrompt(snapshot, "ig", "Vibrant colors");
    expect(prompt).toContain("Vibrant colors");
  });
});
