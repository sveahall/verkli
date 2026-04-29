import { z } from "zod";

const channelEnum = z.enum(["tiktok", "instagram", "x", "facebook"]);
const contentTypeEnum = z.enum(["hook", "blurb", "caption"]);

// ─── Campaign portal v2: plans + posts ──────────────────────────────────────

export const CAMPAIGN_PLAN_CHANNELS = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "x",
  "threads",
] as const;
export type CampaignPlanChannel = (typeof CAMPAIGN_PLAN_CHANNELS)[number];

export const CAMPAIGN_PLAN_CONTENT_TYPES = ["text", "trailer", "podcast"] as const;
export type CampaignPlanContentType = (typeof CAMPAIGN_PLAN_CONTENT_TYPES)[number];

export const CAMPAIGN_PLAN_TEMPLATES = [
  "custom",
  "launch",
  "engagement",
  "awareness",
] as const;
export type CampaignPlanTemplate = (typeof CAMPAIGN_PLAN_TEMPLATES)[number];

export const CAMPAIGN_PLAN_FREQUENCIES = ["1-3", "4-5", "6+"] as const;
export type CampaignPlanFrequency = (typeof CAMPAIGN_PLAN_FREQUENCIES)[number];

export const CAMPAIGN_PLAN_WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type CampaignPlanWeekday = (typeof CAMPAIGN_PLAN_WEEKDAYS)[number];

const channelArray = z.array(z.enum(CAMPAIGN_PLAN_CHANNELS)).min(1).max(20);
const contentTypeArray = z.array(z.enum(CAMPAIGN_PLAN_CONTENT_TYPES)).min(1).max(10);
const languageArray = z.array(z.string().min(2).max(8)).min(1).max(20);

const weeklyScheduleSchema = z
  .record(z.enum(CAMPAIGN_PLAN_WEEKDAYS), z.array(z.enum(CAMPAIGN_PLAN_CHANNELS)))
  .default({});

/** POST /api/author/marketing/campaigns body */
export const createCampaignPlanBodySchema = z.object({
  bookId: z.string().uuid("invalid bookId"),
  name: z.string().trim().max(120).optional(),
  languages: languageArray,
  contentTypes: contentTypeArray,
  channels: channelArray,
  frequency: z.enum(CAMPAIGN_PLAN_FREQUENCIES),
  template: z.enum(CAMPAIGN_PLAN_TEMPLATES).default("launch"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  durationWeeks: z.number().int().min(1).max(26).default(4),
  weeklySchedule: weeklyScheduleSchema,
  mode: z.enum(["organic", "paid"]).default("organic"),
  paidConfig: z.record(z.unknown()).optional().default({}),
});

export type CreateCampaignPlanBody = z.infer<typeof createCampaignPlanBodySchema>;

/** PATCH /api/author/marketing/posts/[id] body */
export const updatePostBodySchema = z.object({
  caption: z.string().max(5000).optional(),
  hashtags: z.string().max(2000).optional(),
  cta: z.string().max(500).optional(),
  status: z
    .enum(["draft", "ready", "asset_pending", "asset_failed", "posted", "skipped"])
    .optional(),
  postedUrl: z.string().url().max(2000).optional(),
});

export type UpdatePostBody = z.infer<typeof updatePostBodySchema>;

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

/** POST /api/marketing/video/generate body */
const trailerSceneSchema = z.object({
  visual_prompt: z.string(),
  duration: z.number().optional(),
});

export const videoGenerateBodySchema = z.object({
  bookId: z.string().min(1, "bookId required").uuid("invalid bookId"),
  prompt: z.string().min(1, "prompt required").max(2_000),
  imageUrl: z.string().min(1, "imageUrl required").url("invalid imageUrl"),
  audio: z.boolean().optional().default(true),
  /** Optional trailer metadata to store in media_assets.metadata */
  metadata: z
    .object({
      scenes: z.array(trailerSceneSchema).optional(),
      caption: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
    })
    .optional(),
});

export type VideoGenerateBody = z.infer<typeof videoGenerateBodySchema>;
