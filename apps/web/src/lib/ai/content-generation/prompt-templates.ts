import type { BookSnapshot, Channel, Tone } from "./schemas";
import { CHANNEL_CONSTRAINTS } from "./schemas";

// ─── Copywriter System Prompt ───────────────────────────────────────────────

export function buildCopywriterSystemPrompt(
  channel: Channel,
  language: string
): string {
  const constraints = CHANNEL_CONSTRAINTS[channel];
  const lang = language === "sv" ? "Swedish" : language;

  return [
    "You are a marketing copywriter for Verkli, a digital book platform.",
    "Rules:",
    "- Use ONLY facts from the provided book data. Do NOT invent plot details, characters, or quotes.",
    "- The headline MUST include the book title exactly as given.",
    `- Write all copy in ${lang}.`,
    "- Return ONLY valid JSON with this exact shape: { \"headline\": string, \"body\": string, \"cta\": string, \"hashtags\": string }",
    `- headline: max ${constraints.maxHeadline} characters`,
    `- body: max ${constraints.maxBody} characters`,
    `- cta: max 100 characters`,
    constraints.maxHashtags > 0
      ? `- hashtags: max ${constraints.maxHashtags} hashtags, space-separated, each starting with #`
      : "- hashtags: empty string (this channel does not use hashtags)",
    "- Do NOT include any text outside the JSON object.",
  ].join("\n");
}

// ─── Copywriter User Prompt ─────────────────────────────────────────────────

export function buildCopywriterUserPrompt(
  snapshot: BookSnapshot,
  channel: Channel,
  tone?: Tone,
  addendum?: string
): string {
  const parts = [
    `Bok: ${snapshot.title}`,
    snapshot.description ? `Beskrivning: ${snapshot.description}` : null,
    `Språk: ${snapshot.language}`,
    `Antal kapitel: ${snapshot.chapterCount}`,
    snapshot.chapterExcerpt
      ? `Utdrag: ${snapshot.chapterExcerpt.slice(0, 500)}`
      : null,
    `Kanal: ${channel}`,
    tone ? `Ton: ${tone}` : null,
    addendum ? `Extra instruktioner: ${addendum}` : null,
  ];

  return parts.filter(Boolean).join("\n");
}

// ─── Video Prompt ───────────────────────────────────────────────────────────

const VIDEO_CHANNEL_HINTS: Record<string, string> = {
  ig: "Instagram Reels style, vertical 9:16, vibrant colors, quick cuts",
  tiktok: "TikTok style, vertical 9:16, trending aesthetic, fast-paced",
  x: "Twitter/X style, landscape 16:9, clean and minimal",
  email: "Email banner style, landscape 16:9, professional",
  generic: "General promotional video, 16:9 or 9:16",
};

export function buildVideoPrompt(
  snapshot: BookSnapshot,
  channel: Channel,
  addendum?: string
): string {
  const hints = VIDEO_CHANNEL_HINTS[channel] ?? VIDEO_CHANNEL_HINTS.generic;
  const parts = [
    `Create a promotional video for the book "${snapshot.title}".`,
    snapshot.description
      ? `Book description: ${snapshot.description}`
      : null,
    `Style: ${hints}`,
    "Do NOT show any text in the video.",
    "Focus on mood, atmosphere, and visual storytelling.",
    addendum ? `Additional direction: ${addendum}` : null,
  ];

  return parts.filter(Boolean).join(" ");
}

// ─── Image Prompt ───────────────────────────────────────────────────────────

const IMAGE_CHANNEL_HINTS: Record<string, string> = {
  ig: "Square 1:1, vibrant and eye-catching, Instagram-ready",
  tiktok: "Vertical 9:16, bold and dynamic, TikTok cover",
  x: "Landscape 16:9, clean and professional, Twitter card",
  email: "Wide landscape, professional email header style",
  generic: "Square 1:1, versatile promotional image",
};

export function buildImagePrompt(
  snapshot: BookSnapshot,
  channel: Channel,
  addendum?: string
): string {
  const hints = IMAGE_CHANNEL_HINTS[channel] ?? IMAGE_CHANNEL_HINTS.generic;
  const parts = [
    `Create a promotional image for the book "${snapshot.title}".`,
    snapshot.description
      ? `Book theme: ${snapshot.description}`
      : null,
    `Style: ${hints}`,
    "Do NOT show any text in the image.",
    "Focus on mood and visual atmosphere that represents the book.",
    addendum ? `Additional direction: ${addendum}` : null,
  ];

  return parts.filter(Boolean).join(" ");
}
