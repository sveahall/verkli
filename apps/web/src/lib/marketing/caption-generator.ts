import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLanguageLabel } from "@/lib/languages";

export type CaptionChannel = "tiktok" | "instagram" | "x" | "facebook";
export type ContentType = "hook" | "blurb" | "caption";

export type CaptionConfig = {
  bookId: string;
  bookTitle: string;
  language: string;
  contentType: ContentType;
  channel: CaptionChannel;
  tone?: string;
  length?: string;
  cta?: string;
};

const CHANNEL_MAX_LENGTH: Record<CaptionChannel, number> = {
  tiktok: 150,
  instagram: 2200,
  x: 280,
  facebook: 500,
};

function buildContentHash(config: CaptionConfig): string {
  const payload = JSON.stringify({
    bookId: config.bookId,
    language: config.language,
    contentType: config.contentType,
    channel: config.channel,
    tone: (config.tone ?? "").trim(),
    length: (config.length ?? "").trim(),
    cta: (config.cta ?? "").trim(),
  });
  return createHash("sha256").update(payload).digest("hex");
}

function truncateToChannel(text: string, channel: CaptionChannel): string {
  const max = CHANNEL_MAX_LENGTH[channel];
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function formatForChannel(text: string, channel: CaptionChannel, cta: string): string {
  const base = text.trim();
  const withCta = cta ? `${base}\n\n${cta}` : base;

  switch (channel) {
    case "tiktok":
      return truncateToChannel(withCta, "tiktok");
    case "x":
      return truncateToChannel(withCta, "x");
    case "instagram":
      return withCta;
    case "facebook":
      return withCta;
    default:
      return withCta;
  }
}

function generateCaptionText(config: CaptionConfig): string {
  const langLabel = getLanguageLabel(config.language);
  const shareUrl = `/reader/books/${config.bookId}`;
  const tone = (config.tone ?? "engaging").toLowerCase();
  const length = (config.length ?? "medium").toLowerCase();
  const cta = (config.cta ?? "Läs mer på Verkli").trim();

  const shortPhrases = [
    `Nu ute: ${config.bookTitle} på ${langLabel}.`,
    `${config.bookTitle} – nu på ${langLabel}.`,
  ];
  const mediumPhrases = [
    `Just nu: ${config.bookTitle} tillgänglig på ${langLabel}. Upptäck boken på Verkli.`,
    `Vi är glada att presentera ${config.bookTitle} på ${langLabel}. Läs den här.`,
  ];
  const longPhrases = [
    `Boken ${config.bookTitle} är nu tillgänglig på ${langLabel}. Oavsett om du vill ha en kort hook eller en längre berättelse – hitta den på Verkli. ${shareUrl}`,
  ];

  let base: string;
  if (config.contentType === "hook") {
    base =
      length === "short"
        ? shortPhrases[0]
        : length === "long"
          ? longPhrases[0]
          : mediumPhrases[0];
  } else if (config.contentType === "blurb") {
    base =
      length === "short"
        ? shortPhrases[1]
        : length === "long"
          ? longPhrases[0]
          : mediumPhrases[1];
  } else {
    base =
      length === "short"
        ? shortPhrases[0]
        : length === "long"
          ? longPhrases[0]
          : mediumPhrases[0];
  }

  if (tone === "formal") {
    base = base.replace(/Nu ute|Just nu|Vi är glada/gi, (m) => m);
  }
  if (tone === "casual") {
    base = base.replace(/tillgänglig|presentera/gi, "ute");
  }

  return formatForChannel(base, config.channel, cta);
}

export async function getCachedOrGenerateCaption(
  config: CaptionConfig
): Promise<{ caption: string; fromCache: boolean }> {
  const hash = buildContentHash(config);
  const admin = createAdminClient();

  const { data: cached } = await admin
    .from("marketing_caption_cache")
    .select("caption_text")
    .eq("content_hash", hash)
    .maybeSingle();

  const row = cached as { caption_text: string } | null;
  if (row?.caption_text) {
    return { caption: row.caption_text, fromCache: true };
  }

  const caption = generateCaptionText(config);
  await admin.from("marketing_caption_cache").upsert(
    { content_hash: hash, caption_text: caption },
    { onConflict: "content_hash" }
  );

  return { caption, fromCache: false };
}

export { buildContentHash, generateCaptionText };
