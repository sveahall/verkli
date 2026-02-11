import { describe, it, expect } from "vitest";
import {
  ContentGenerationRequestSchema,
  ContentGenerationResultSchema,
  BookSnapshotSchema,
  TextContentSchema,
  CHANNEL_CONSTRAINTS,
  validateTextContent,
} from "./schemas";
import type { TextContent, BookSnapshot, Channel } from "./schemas";

// ─── Schema Parsing ─────────────────────────────────────────────────────────

describe("ContentGenerationRequestSchema", () => {
  it("parses a valid request with defaults", () => {
    const result = ContentGenerationRequestSchema.safeParse({
      contentType: "text",
      channel: "ig",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("sv");
    }
  });

  it("parses a full request", () => {
    const result = ContentGenerationRequestSchema.safeParse({
      contentType: "video",
      channel: "tiktok",
      language: "en",
      tone: "casual",
      headline: "Test",
      body: "Body text",
      cta: "Read now",
      durationSeconds: 15,
      aspectRatio: "9:16",
      userPromptAddendum: "Focus on suspense",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid contentType", () => {
    const result = ContentGenerationRequestSchema.safeParse({
      contentType: "pdf",
      channel: "ig",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid channel", () => {
    const result = ContentGenerationRequestSchema.safeParse({
      contentType: "text",
      channel: "facebook",
    });
    expect(result.success).toBe(false);
  });

  it("rejects headline over 200 chars", () => {
    const result = ContentGenerationRequestSchema.safeParse({
      contentType: "text",
      channel: "ig",
      headline: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects durationSeconds below 4", () => {
    const result = ContentGenerationRequestSchema.safeParse({
      contentType: "video",
      channel: "ig",
      durationSeconds: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects durationSeconds above 60", () => {
    const result = ContentGenerationRequestSchema.safeParse({
      contentType: "video",
      channel: "ig",
      durationSeconds: 120,
    });
    expect(result.success).toBe(false);
  });
});

describe("ContentGenerationResultSchema", () => {
  it("parses a valid result", () => {
    const result = ContentGenerationResultSchema.safeParse({
      contentType: "text",
      channel: "ig",
      assetUrl: null,
      textContent: {
        headline: "Test",
        body: "Body",
        cta: "CTA",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts null textContent", () => {
    const result = ContentGenerationResultSchema.safeParse({
      contentType: "image",
      channel: "x",
      assetUrl: "https://example.com/img.png",
      textContent: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("BookSnapshotSchema", () => {
  it("parses a valid snapshot", () => {
    const result = BookSnapshotSchema.safeParse({
      title: "Min bok",
      description: "En spännande bok",
      language: "sv",
      coverImageUrl: null,
      chapterExcerpt: "Det var en mörk natt...",
      chapterCount: 12,
    });
    expect(result.success).toBe(true);
  });
});

describe("TextContentSchema", () => {
  it("parses with optional hashtags", () => {
    const result = TextContentSchema.safeParse({
      headline: "Test",
      body: "Body",
      cta: "Read",
    });
    expect(result.success).toBe(true);
  });

  it("parses with hashtags", () => {
    const result = TextContentSchema.safeParse({
      headline: "Test",
      body: "Body",
      cta: "Read",
      hashtags: "#test #book",
    });
    expect(result.success).toBe(true);
  });
});

// ─── Channel Constraints ────────────────────────────────────────────────────

describe("CHANNEL_CONSTRAINTS", () => {
  it("has constraints for all channels", () => {
    const channels: Channel[] = ["ig", "tiktok", "x", "email", "generic"];
    for (const ch of channels) {
      expect(CHANNEL_CONSTRAINTS[ch]).toBeDefined();
      expect(CHANNEL_CONSTRAINTS[ch].maxHeadline).toBeGreaterThan(0);
      expect(CHANNEL_CONSTRAINTS[ch].maxBody).toBeGreaterThan(0);
      expect(CHANNEL_CONSTRAINTS[ch].allowedContentTypes.length).toBeGreaterThan(0);
    }
  });

  it("tiktok does not allow image", () => {
    expect(CHANNEL_CONSTRAINTS.tiktok.allowedContentTypes).not.toContain("image");
  });

  it("x does not allow video", () => {
    expect(CHANNEL_CONSTRAINTS.x.allowedContentTypes).not.toContain("video");
  });

  it("email has 0 max hashtags", () => {
    expect(CHANNEL_CONSTRAINTS.email.maxHashtags).toBe(0);
  });
});

// ─── Hallucination Validator ────────────────────────────────────────────────

describe("validateTextContent", () => {
  const snapshot: BookSnapshot = {
    title: "Nattens skuggor",
    description: "En thriller",
    language: "sv",
    coverImageUrl: null,
    chapterExcerpt: null,
    chapterCount: 10,
  };

  it("returns valid when headline includes book title", () => {
    const content: TextContent = {
      headline: "Nattens skuggor — ny bok!",
      body: "En spännande thriller.",
      cta: "Läs nu",
    };
    const result = validateTextContent(content, snapshot, "ig");
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags when headline does not include book title", () => {
    const content: TextContent = {
      headline: "Ny bok!",
      body: "En thriller.",
      cta: "Läs nu",
    };
    const result = validateTextContent(content, snapshot, "ig");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("book title"))).toBe(true);
  });

  it("flags when headline exceeds channel max", () => {
    const content: TextContent = {
      headline: "Nattens skuggor " + "x".repeat(100),
      body: "Text",
      cta: "Läs",
    };
    const result = validateTextContent(content, snapshot, "x"); // x max headline = 50
    expect(result.issues.some((i) => i.includes("Headline exceeds"))).toBe(true);
  });

  it("flags when body exceeds channel max", () => {
    const content: TextContent = {
      headline: "Nattens skuggor",
      body: "a".repeat(300),
      cta: "Läs",
    };
    const result = validateTextContent(content, snapshot, "x"); // x max body = 280
    expect(result.issues.some((i) => i.includes("Body exceeds"))).toBe(true);
  });

  it("flags too many hashtags", () => {
    const content: TextContent = {
      headline: "Nattens skuggor",
      body: "Text",
      cta: "Läs",
      hashtags: "#a #b #c #d #e #f",
    };
    const result = validateTextContent(content, snapshot, "x"); // x max 3
    expect(result.issues.some((i) => i.includes("Too many hashtags"))).toBe(true);
  });
});
