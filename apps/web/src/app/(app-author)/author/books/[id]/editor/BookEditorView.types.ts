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

export type Tool =
  | "edit"
  | "cover"
  | "translate"
  | "audiobook"
  | "print"
  | "pricing"
  | "publish"
  | "market"
  | "review"
  | "statistics"
  | "import";

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
  /** Signed URL (never a raw DB column). null when audio_path is missing. */
  audioSignedUrl: string | null;
  status: string;
  created_at: string;
} | null;
