import type { PublishVisibility } from "./BookEditorView.types";

export const ACCEPTED_COVER_TYPES = ".jpg,.jpeg,.png,image/jpeg,image/png";

const ACCEPTED_COVER_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const ACCEPTED_COVER_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export const STORAGE_PRESET = "verkli_editor_preset";

export const VISIBILITY_LABELS: Record<PublishVisibility, string> = {
  public: "Public",
  followers: "Followers only",
  private: "Private",
};

export const PUBLISH_VISIBILITY_OPTIONS: Array<{
  value: PublishVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "public",
    label: "Public",
    description: "Visible to everyone. Shown in Discover and on your profile.",
  },
  {
    value: "followers",
    label: "Followers only",
    description: "Visible only to readers who follow you.",
  },
  {
    value: "private",
    label: "Private",
    description: "Only you can see this version.",
  },
];

export function normalizeLangKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeVisibility(
  value: string | null | undefined
): PublishVisibility | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "public" ||
    normalized === "followers" ||
    normalized === "private"
  ) {
    return normalized;
  }
  return null;
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if (
    "content" in node &&
    Array.isArray((node as { content?: unknown[] }).content)
  ) {
    return (node as { content: unknown[] }).content.map(extractText).join("");
  }
  return "";
}

export function countWordsInContent(content: string | null): number {
  if (!content) return 0;
  try {
    const parsed = JSON.parse(content);
    const text = extractText(parsed);
    return text.trim().split(/\s+/).filter(Boolean).length;
  } catch {
    return content.trim().split(/\s+/).filter(Boolean).length;
  }
}

export function hasReadableContent(content: string | null): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return extractText(parsed).trim().length > 0;
  } catch {
    return content.trim().length > 0;
  }
}

export function describeVisibility(value: PublishVisibility): string {
  if (value === "public") return "Visible to everyone";
  if (value === "followers") return "Visible to followers only";
  return "Only you can see this version";
}

export const MARKETING_CHANNELS = [
  "generic",
  "tiktok",
  "instagram",
  "x",
] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  generic: "General",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

export const COVER_AI_STYLES = [
  { value: "minimal", label: "Minimal" },
  { value: "photographic", label: "Photographic" },
  { value: "illustrated", label: "Illustrated" },
  { value: "vintage", label: "Vintage" },
] as const;

export function getFileExtension(fileName: string): string {
  const normalized = fileName.split("?")[0]?.split("#")[0] ?? fileName;
  const leaf = normalized.split("/").pop() ?? normalized;
  if (!leaf.includes(".")) {
    return "";
  }
  return leaf.split(".").pop()?.trim().toLowerCase() ?? "";
}

export function isAcceptedCoverFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  return (
    ACCEPTED_COVER_MIME_TYPES.has(file.type) ||
    ACCEPTED_COVER_EXTENSIONS.has(extension)
  );
}

export function getGeneratedCoverExtension(
  contentType: string | null | undefined,
  url: string
): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";

  const extension = getFileExtension(url.split("?")[0] ?? "");
  if (extension) return extension;
  return "png";
}

export const STATUS_LABELS = {
  pending: "Queued",
  running: "Running",
  completed: "Succeeded",
  failed: "Failed",
  idle: "Queued",
} as const;

export function getAudiobookStatusLabel(status: string): string {
  if (
    status === "published" ||
    status === "generated" ||
    status === "completed"
  ) {
    return STATUS_LABELS.completed;
  }
  if (status === "generating") return STATUS_LABELS.running;
  if (status === "queued") return STATUS_LABELS.pending;
  if (status === "paused") return "Paused";
  if (status === "pause_requested") return "Pause requested";
  if (status === "cancel_requested") return "Stopping...";
  if (status === "cancelled") return "Cancelled";
  if (status === "idle" || status === "not_started") return "Not started";
  if (status === "disabled") return "Worker unavailable";
  if (status === "failed") return "Generation failed";
  return "No audiobook yet";
}

export function formatPlayerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatAudiobookEta(
  seconds: number | null | undefined
): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) return "Less than 1 min remaining";

  const totalMinutes = Math.round(roundedSeconds / 60);
  if (totalMinutes < 60) return `About ${totalMinutes} min remaining`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `About ${hours}h remaining`;
  return `About ${hours}h ${minutes}m remaining`;
}

export function getMarketingCampaignStatusLabel(status: string): string {
  if (status === "generated" || status === "published") {
    return STATUS_LABELS.completed;
  }
  if (status === "failed") return STATUS_LABELS.failed;
  if (status === "pending" || status === "generating") {
    return STATUS_LABELS.running;
  }
  return STATUS_LABELS.idle;
}

export const TRANSLATION_POLL_MAX_MS = 120_000;

export const IMPORT_ALLOWED_EXT = [
  ".epub",
  ".docx",
  ".html",
  ".htm",
  ".txt",
  ".pdf",
];

export const IMPORT_MAX_MB = 50;

export const IMPORT_MAX_BYTES = IMPORT_MAX_MB * 1024 * 1024;
