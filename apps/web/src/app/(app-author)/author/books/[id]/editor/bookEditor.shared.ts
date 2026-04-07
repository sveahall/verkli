const ACCEPTED_COVER_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const ACCEPTED_COVER_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export const ACCEPTED_COVER_TYPES = ".jpg,.jpeg,.png,image/jpeg,image/png";
export const STORAGE_PRESET = "verkli_editor_preset";
export const TRANSLATION_POLL_MAX_MS = 120_000;
export const IMPORT_ALLOWED_EXT = [".epub", ".docx", ".html", ".htm", ".txt", ".pdf"];
export const IMPORT_MAX_MB = 50;
export const IMPORT_MAX_BYTES = IMPORT_MAX_MB * 1024 * 1024;

export type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
  book_version_id: string;
};

export type PublishVisibility = "public" | "followers" | "private";
export type AudiobookGenerationScope = "book" | "current" | "selected";
export type AudiobookControlAction = "pause" | "resume" | "cancel";

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

export function normalizeVisibility(value: string | null | undefined): PublishVisibility | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "public" || normalized === "followers" || normalized === "private") {
    return normalized;
  }
  return null;
}

export function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if ("content" in node && Array.isArray((node as { content?: unknown[] }).content)) {
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

export const MARKETING_CHANNELS = ["generic", "tiktok", "instagram", "x"] as const;
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
  return fileName.split(".").pop()?.trim().toLowerCase() ?? "";
}

export function isAcceptedCoverFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  return ACCEPTED_COVER_MIME_TYPES.has(file.type) || ACCEPTED_COVER_EXTENSIONS.has(extension);
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
  if (status === "published" || status === "generated" || status === "completed") return STATUS_LABELS.completed;
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

export function formatAudiobookEta(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
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
  if (status === "generated" || status === "published") return STATUS_LABELS.completed;
  if (status === "failed") return STATUS_LABELS.failed;
  if (status === "pending" || status === "generating") return STATUS_LABELS.running;
  return STATUS_LABELS.idle;
}

export type MarketingCampaignRow = {
  id: string;
  book_id: string;
  language: string;
  channel: string;
  status: string;
  headline: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string | null;
  share_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Book = {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  status: string;
  language?: string | null;
  original_language?: string | null;
  original_source?: string | null;
  original_url?: string | null;
  audiobook_status?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  pricing_model?: string | null;
  print_on_demand_settings?: unknown | null;
  setup_state?: unknown | null;
};

export type BookVersion = {
  id: string;
  book_id: string;
  language_code: string;
  status: string;
  published_at?: string | null;
  published_chapter_count?: number | null;
  visibility?: PublishVisibility | null;
  created_at?: string;
  updated_at?: string;
  error_message?: string | null;
};

export type LatestAudiobookAsset = {
  id: string;
  audioSignedUrl: string | null;
  status: string;
  created_at: string;
} | null;

export type Tool =
  | "dashboard"
  | "edit"
  | "cover"
  | "translate"
  | "audiobook"
  | "print"
  | "pricing"
  | "publish"
  | "market"
  | "trailer"
  | "review"
  | "statistics"
  | "import"
  | "ai";

/**
 * The linear production flow: Write → Cover → Audio → Translate → Publish → Review.
 * Panels like statistics, import, print, pricing, market still exist but are not
 * part of the main stepper — they're accessible via direct URL (?panel=…).
 */
export const TOOL_ORDER: Tool[] = [
  "edit",
  "cover",
  "audiobook",
  "translate",
  "publish",
  "review",
];

/**
 * Extended tool order including dashboard as the landing view.
 * Dashboard is intentionally not in TOOL_ORDER (stepper flow).
 */
export const ALL_TOOLS: Tool[] = [
  "dashboard",
  ...TOOL_ORDER,
  "trailer",
  "market",
  "ai",
  "statistics",
  "import",
  "print",
  "pricing",
];

export const TOOL_META: Record<
  Tool,
  {
    label: string;
    description: string;
    shortLabel: string;
  }
> = {
  dashboard: {
    label: "Dashboard",
    description: "Overview of your book with quick access to every area.",
    shortLabel: "Overview",
  },
  edit: {
    label: "Write",
    description: "Shape the manuscript, structure chapters, and keep the draft moving.",
    shortLabel: "Draft",
  },
  cover: {
    label: "Cover",
    description: "Upload, crop, or generate a cover that looks ready for launch.",
    shortLabel: "Package",
  },
  audiobook: {
    label: "Audio",
    description: "Turn the manuscript into narration with clear language and scope controls.",
    shortLabel: "Narrate",
  },
  translate: {
    label: "Translate",
    description: "Expand the book into more languages without leaving the workflow.",
    shortLabel: "Localize",
  },
  publish: {
    label: "Publish",
    description: "Set pricing, print formats, visibility, and release chapters.",
    shortLabel: "Release",
  },
  review: {
    label: "Review",
    description: "Final pre-publish overview — preview every detail and decide if the book is ready.",
    shortLabel: "Review",
  },
  print: {
    label: "Print",
    description: "Configure print-on-demand settings, editions, ISBN, and format pricing.",
    shortLabel: "Print",
  },
  pricing: {
    label: "Pricing",
    description: "Set the business model, reader price, and access level.",
    shortLabel: "Monetize",
  },
  market: {
    label: "Market",
    description: "Generate launch assets, share links, and get campaign copy ready.",
    shortLabel: "Promote",
  },
  statistics: {
    label: "Stats",
    description: "Track attention, progress, and traction once the book is live.",
    shortLabel: "Measure",
  },
  import: {
    label: "Import",
    description: "Bring in a manuscript, repair structure, and replace drafts safely.",
    shortLabel: "Ingest",
  },
  trailer: {
    label: "Trailer",
    description: "Generate an AI-powered video trailer for your book.",
    shortLabel: "Trailer",
  },
  ai: {
    label: "AI Assistant",
    description: "Chat with an AI writing assistant about your manuscript.",
    shortLabel: "AI",
  },
};

export function getToolHref(bookId: string, tool: Tool): string {
  if (tool === "edit") return `/author/books/${bookId}`;
  if (tool === "dashboard") return `/author/books/${bookId}?panel=dashboard`;
  return `/author/books/${bookId}?panel=${tool}`;
}

export type BookEditorProps = {
  book: Book;
  chapters: Chapter[];
  bookVersions: BookVersion[];
  activeVersion: BookVersion | null;
  authorDisplayName?: string;
  defaultPublishVisibility?: "public" | "followers" | "private";
  latestAudiobookAsset?: LatestAudiobookAsset;
  marketingCampaigns?: MarketingCampaignRow[];
  stripeConfigured?: boolean;
  visibleTools?: Tool[];
  initialTool?: Tool;
};

export function getInitialTool(
  visibleTools: Tool[] | undefined,
  initialTool: Tool | undefined
): Tool {
  const tools = visibleTools ?? TOOL_ORDER;
  if (initialTool && tools.includes(initialTool)) return initialTool;
  return tools[0] ?? "edit";
}
