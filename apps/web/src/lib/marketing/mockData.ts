import type { Campaign, Channel, GeneratorOutput, Metric } from "./types";

export const campaigns: Campaign[] = [
  {
    id: "cmp-aurora-launch",
    name: "Launch Week: Aurora Drafts",
    objective: "Drive preorders for the new fantasy release",
    status: "active",
    startDate: "2026-02-03",
    endDate: "2026-02-10",
    updatedAt: "2026-01-28",
    channels: ["email", "instagram", "tiktok"],
    budget: "$450",
  },
  {
    id: "cmp-spring-serial",
    name: "Spring Serial Teasers",
    objective: "Build waitlist for weekly chapter drops",
    status: "scheduled",
    startDate: "2026-02-15",
    endDate: "2026-03-01",
    updatedAt: "2026-01-26",
    channels: ["substack", "instagram"],
    budget: "$300",
  },
  {
    id: "cmp-backlist-refresh",
    name: "Backlist Refresh",
    objective: "Re-engage readers on completed series",
    status: "draft",
    updatedAt: "2026-01-21",
    channels: ["email"],
  },
  {
    id: "cmp-holiday-wrap",
    name: "Holiday Wrap-Up",
    objective: "Thank readers and highlight top reviews",
    status: "finished",
    startDate: "2025-12-10",
    endDate: "2025-12-31",
    updatedAt: "2026-01-02",
    channels: ["email", "substack"],
  },
];

export const channels: Channel[] = [
  {
    id: "email",
    label: "Email",
    description: "Weekly newsletter and launch announcements",
    enabled: true,
  },
  {
    id: "substack",
    label: "Substack",
    description: "Serialized chapters and behind-the-scenes posts",
    enabled: true,
  },
  {
    id: "instagram",
    label: "Instagram",
    description: "Reels, stories, and carousel highlights",
    enabled: false,
  },
  {
    id: "tiktok",
    label: "TikTok",
    description: "Short-form hooks and character moments",
    enabled: false,
  },
];

export const metrics: Metric[] = [
  { id: "reach", label: "Reach", value: "24.8k", change: "+12%", trend: "up" },
  { id: "clicks", label: "Clicks", value: "3.1k", change: "+6%", trend: "up" },
  { id: "conversions", label: "Conversions", value: "186", change: "-2%", trend: "down" },
  { id: "ctr", label: "CTR", value: "3.7%", change: "+0.4%", trend: "up" },
];

export const generatorOutputs: GeneratorOutput[] = [
  {
    id: "hook",
    label: "Hook generator",
    placeholder: "Describe the moment you want to highlight...",
    sampleOutput:
      "She had seven seconds to decide: trust the map, or trust her instincts."
  },
  {
    id: "blurb",
    label: "Blurb generator",
    placeholder: "Summarize the chapter, theme, or cliffhanger...",
    sampleOutput:
      "When the archive doors reopen, every secret comes with a cost. Aurora must choose which truth to protect."
  },
  {
    id: "social",
    label: "Social captions",
    placeholder: "Share the mood, character, or release update...",
    sampleOutput:
      "New chapter drop tonight. Bring a candle, a compass, and a taste for secrets."
  },
];
