// Static configuration for CampaignWizard: brand icons, channel definitions,
// content-type and frequency options, and the shared interactive card styles.
// Split out so the main wizard file can focus on state and step composition.

import type { ReactNode } from "react";

// ─── Channel / content / frequency identifiers ──────────────────────────────

export type ChannelId =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "facebook"
  | "x"
  | "threads";

export type ContentTypeId = "text" | "trailer" | "podcast";

export type PostFrequency = "1-3" | "4-5" | "6+";

export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type ContentTemplate = "custom" | "launch" | "engagement" | "awareness";

export type CampaignBook = {
  id: string;
  title: string | null;
  cover_image: string | null;
  language?: string | null;
};

// ─── Weekday + template options ─────────────────────────────────────────────

export const WEEKDAY_LABELS: Record<WeekDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const WEEKDAYS: WeekDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const TEMPLATE_OPTIONS: { value: ContentTemplate; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "launch", label: "Book release" },
  { value: "engagement", label: "Reader engagement" },
  { value: "awareness", label: "Visibility" },
];

// ─── Shared interactive styles (matching app design tokens) ─────────────────

export const CARD_IDLE =
  "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]";
export const CARD_HOVER =
  "hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]";
export const CARD_SELECTED =
  "border-[#907AFF]/40 bg-[#907AFF]/[0.06] dark:border-[#907AFF]/40 dark:bg-[#907AFF]/[0.08]";
export const PRESSABLE = "active:scale-[0.98] transition-all duration-150";

// ─── Channel brand icons ────────────────────────────────────────────────────

function InstagramIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-grad)" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" stroke="url(#ig-grad)" strokeWidth="1.5" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="url(#ig-grad)" />
      <defs>
        <linearGradient id="ig-grad" x1="2" y1="22" x2="22" y2="2">
          <stop stopColor="#F58529" />
          <stop offset="0.5" stopColor="#DD2A7B" />
          <stop offset="1" stopColor="#8134AF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M9 12a4 4 0 1 0 4 4V4c.5 2.5 3 4 5 4" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-white" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="4" stroke="#FF0000" strokeWidth="1.5" />
      <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FF0000" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z" stroke="#1877F2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M4 4L10.5 12.5L4 20H6L11.5 13.5L16 20H20L13 11L19 4H17L12 10L8 4H4Z" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-white" />
    </svg>
  );
}

function ThreadsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 21a9 9 0 0 1-9-9 9 9 0 0 1 9-9 9 9 0 0 1 8.5 6M15 10c-1-1-2.5-1.5-4-1a3.5 3.5 0 0 0-2 3c0 2 1.5 3.5 3.5 3.5s3.5-1 4-3c.3-1.3 0-3-1-4" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="dark:stroke-white" />
    </svg>
  );
}

// ─── Channel + content-type catalogue ───────────────────────────────────────

export type ChannelConfig = {
  id: ChannelId;
  label: string;
  icon: ReactNode;
};

export const CHANNELS: ChannelConfig[] = [
  { id: "instagram", label: "Instagram", icon: <InstagramIcon /> },
  { id: "tiktok", label: "TikTok", icon: <TikTokIcon /> },
  { id: "youtube", label: "YouTube", icon: <YouTubeIcon /> },
  { id: "facebook", label: "Facebook", icon: <FacebookIcon /> },
  { id: "x", label: "X/Twitter", icon: <XIcon /> },
  { id: "threads", label: "Threads", icon: <ThreadsIcon /> },
];

export const FREQUENCY_OPTIONS: { value: PostFrequency; label: string }[] = [
  { value: "1-3", label: "1–3 times" },
  { value: "4-5", label: "4–5 times" },
  { value: "6+", label: "6+ times" },
];

export const CHANNEL_DAY_COLORS: Record<ChannelId, string> = {
  instagram: "bg-pink-300 dark:bg-pink-500/50",
  tiktok: "bg-slate-400 dark:bg-white/40",
  youtube: "bg-red-300 dark:bg-red-500/50",
  facebook: "bg-blue-300 dark:bg-blue-500/50",
  x: "bg-amber-300 dark:bg-amber-500/50",
  threads: "bg-green-300 dark:bg-green-500/50",
};

export const CONTENT_TYPES: {
  id: ContentTypeId;
  label: string;
  description: string;
  emoji: string;
}[] = [
  { id: "text", label: "Text card", description: "Caption + hashtags ready to copy", emoji: "✍️" },
  { id: "trailer", label: "Book trailer", description: "AI video trailer (5–15s)", emoji: "🎬" },
  { id: "podcast", label: "Podcast clip", description: "Narrated chapter excerpt", emoji: "🎙️" },
];
