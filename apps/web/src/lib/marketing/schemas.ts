import { z } from "zod";

const channelEnum = z.enum(["tiktok", "instagram", "x", "facebook"]);
const contentTypeEnum = z.enum(["hook", "blurb", "caption"]);

/** POST /api/marketing/caption/generate body */
export const captionGenerateBodySchema = z.object({
  bookId: z.string().min(1, "bookId required").uuid("invalid bookId"),
  language: z.string().min(1).optional(),
  channel: channelEnum.optional().default("instagram"),
  contentType: contentTypeEnum.optional().default("caption"),
  tone: z.string().max(100).optional(),
  length: z.string().max(50).optional(),
  cta: z.string().max(500).optional(),
});

export type CaptionGenerateBody = z.infer<typeof captionGenerateBodySchema>;

/** POST /api/marketing/assets body */
export const createAssetBodySchema = z.object({
  bookId: z.string().min(1, "bookId required").uuid("invalid bookId"),
  channel: channelEnum,
  language: z.string().min(1).optional(),
  contentType: contentTypeEnum.optional().default("caption"),
  text: z.string().min(1, "text required").max(100_000),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateAssetBody = z.infer<typeof createAssetBodySchema>;

/** GET /api/marketing/assets query */
export const listAssetsQuerySchema = z.object({
  bookId: z.string().min(1, "bookId required").uuid("invalid bookId"),
});

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
