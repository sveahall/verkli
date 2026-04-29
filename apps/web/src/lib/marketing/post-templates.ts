import { getLanguageLabel } from "@/lib/languages";
import type { CampaignPlanChannel, CampaignPlanContentType, CampaignPlanTemplate } from "./schemas";

type CopyContext = {
  bookId: string;
  bookTitle: string;
  language: string;
  channel: CampaignPlanChannel;
  contentType: CampaignPlanContentType;
  template: CampaignPlanTemplate;
  variantIndex: number;
};

const HASHTAGS_BY_CHANNEL: Record<CampaignPlanChannel, string> = {
  instagram: "#bookstagram #booklover #newrelease #verkli",
  tiktok: "#booktok #booktrailer #verkli #bookrec",
  youtube: "#booktrailer #booktube #verkli",
  facebook: "#newbook #booklovers #verkli",
  x: "#booktwt #amreading #verkli",
  threads: "#books #booklover #verkli",
};

const TEMPLATE_HOOKS_LAUNCH = [
  "Just launched.",
  "Now available in {lang}:",
  "New release.",
  "Out today.",
];

const TEMPLATE_HOOKS_ENGAGEMENT = [
  "Tell me — would you read this?",
  "Pick a side:",
  "Honest question:",
  "Drop a 📖 if this is your kind of story.",
];

const TEMPLATE_HOOKS_AWARENESS = [
  "Books that stay with you.",
  "Three reasons to start:",
  "If you liked your last read, try this.",
  "Reading something new this week?",
];

const TEMPLATE_HOOKS_CUSTOM = [
  "Your next read:",
  "Pick this up.",
  "On Verkli now.",
  "Stories that travel.",
];

function pickHook(template: CampaignPlanTemplate, idx: number, lang: string): string {
  const pool =
    template === "launch"
      ? TEMPLATE_HOOKS_LAUNCH
      : template === "engagement"
        ? TEMPLATE_HOOKS_ENGAGEMENT
        : template === "awareness"
          ? TEMPLATE_HOOKS_AWARENESS
          : TEMPLATE_HOOKS_CUSTOM;
  const raw = pool[idx % pool.length];
  return raw.replace("{lang}", getLanguageLabel(lang));
}

function bodyForContentType(ctx: CopyContext): string {
  const langLabel = getLanguageLabel(ctx.language);
  switch (ctx.contentType) {
    case "trailer":
      return `Watch the trailer for ${ctx.bookTitle} — now reading in ${langLabel} on Verkli.`;
    case "podcast":
      return `Listen to the first chapter of ${ctx.bookTitle} on Verkli — narrated and ready in ${langLabel}.`;
    case "text":
    default:
      return `${ctx.bookTitle} is out on Verkli, ready to read in ${langLabel}.`;
  }
}

function ctaForChannel(channel: CampaignPlanChannel): string {
  switch (channel) {
    case "instagram":
    case "tiktok":
    case "threads":
      return "Link in bio.";
    case "youtube":
      return "Read on Verkli — link in description.";
    case "facebook":
      return "Read on Verkli.";
    case "x":
      return "Read on Verkli.";
  }
}

export function buildPostCopy(ctx: CopyContext): {
  headline: string;
  caption: string;
  hashtags: string;
  cta: string;
  shareUrl: string;
} {
  const hook = pickHook(ctx.template, ctx.variantIndex, ctx.language);
  const body = bodyForContentType(ctx);
  const cta = ctaForChannel(ctx.channel);
  const shareUrl = `/reader/books/${ctx.bookId}`;

  let caption: string;
  if (ctx.channel === "x") {
    // Keep within ~270 chars
    caption = `${hook} ${body} ${shareUrl}`.slice(0, 270);
  } else if (ctx.channel === "tiktok") {
    caption = `${hook} ${body}`.slice(0, 180);
  } else {
    caption = `${hook}\n\n${body}\n\n${cta}`;
  }

  return {
    headline: `${ctx.bookTitle} — ${getLanguageLabel(ctx.language)}`,
    caption,
    hashtags: HASHTAGS_BY_CHANNEL[ctx.channel],
    cta,
    shareUrl,
  };
}
