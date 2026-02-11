import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const ContentTypeSchema = z.enum(["video", "image", "text"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ChannelSchema = z.enum(["ig", "tiktok", "x", "email", "generic"]);
export type Channel = z.infer<typeof ChannelSchema>;

export const ToneSchema = z.enum(["casual", "professional", "urgent"]);
export type Tone = z.infer<typeof ToneSchema>;

// ─── Book Snapshot (grounding) ──────────────────────────────────────────────

export const BookSnapshotSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  language: z.string(),
  coverImageUrl: z.string().nullable(),
  chapterExcerpt: z.string().max(2000).nullable(),
  chapterCount: z.number().int(),
});
export type BookSnapshot = z.infer<typeof BookSnapshotSchema>;

// ─── Text Content Output ────────────────────────────────────────────────────

export const TextContentSchema = z.object({
  headline: z.string(),
  body: z.string(),
  cta: z.string(),
  hashtags: z.string().optional(),
});
export type TextContent = z.infer<typeof TextContentSchema>;

// ─── Request ────────────────────────────────────────────────────────────────

export const ContentGenerationRequestSchema = z.object({
  contentType: ContentTypeSchema,
  channel: ChannelSchema,
  language: z.string().min(2).max(10).default("sv"),
  tone: ToneSchema.optional(),
  headline: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
  cta: z.string().max(100).optional(),
  durationSeconds: z.number().int().min(4).max(60).optional(),
  aspectRatio: z.string().max(20).optional(),
  userPromptAddendum: z.string().max(500).optional(),
});
export type ContentGenerationRequest = z.infer<typeof ContentGenerationRequestSchema>;

// ─── Result ─────────────────────────────────────────────────────────────────

export const ContentGenerationResultSchema = z.object({
  contentType: ContentTypeSchema,
  channel: ChannelSchema,
  assetUrl: z.string().nullable(),
  textContent: TextContentSchema.nullable(),
  metadata: z.record(z.unknown()).optional(),
});
export type ContentGenerationResult = z.infer<typeof ContentGenerationResultSchema>;

// ─── Channel Constraints ────────────────────────────────────────────────────

export interface ChannelConstraints {
  maxHeadline: number;
  maxBody: number;
  maxHashtags: number;
  allowedContentTypes: ContentType[];
}

export const CHANNEL_CONSTRAINTS: Record<Channel, ChannelConstraints> = {
  ig: { maxHeadline: 100, maxBody: 2200, maxHashtags: 30, allowedContentTypes: ["video", "image", "text"] },
  tiktok: { maxHeadline: 80, maxBody: 300, maxHashtags: 5, allowedContentTypes: ["video", "text"] },
  x: { maxHeadline: 50, maxBody: 280, maxHashtags: 3, allowedContentTypes: ["image", "text"] },
  email: { maxHeadline: 120, maxBody: 2000, maxHashtags: 0, allowedContentTypes: ["image", "text"] },
  generic: { maxHeadline: 200, maxBody: 2000, maxHashtags: 10, allowedContentTypes: ["video", "image", "text"] },
};

// ─── Hallucination Validator ────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateTextContent(
  content: TextContent,
  snapshot: BookSnapshot,
  channel: Channel
): ValidationResult {
  const issues: string[] = [];
  const constraints = CHANNEL_CONSTRAINTS[channel];

  // Check headline references book title
  const titleLower = snapshot.title.toLowerCase();
  if (!content.headline.toLowerCase().includes(titleLower)) {
    issues.push(`Headline does not reference book title "${snapshot.title}"`);
  }

  // Enforce channel character limits
  if (content.headline.length > constraints.maxHeadline) {
    issues.push(`Headline exceeds ${constraints.maxHeadline} chars (got ${content.headline.length})`);
  }
  if (content.body.length > constraints.maxBody) {
    issues.push(`Body exceeds ${constraints.maxBody} chars (got ${content.body.length})`);
  }
  if (content.hashtags) {
    const tagCount = content.hashtags.split(/\s+/).filter((t) => t.startsWith("#")).length;
    if (tagCount > constraints.maxHashtags) {
      issues.push(`Too many hashtags: ${tagCount} > ${constraints.maxHashtags}`);
    }
  }

  return { valid: issues.length === 0, issues };
}
