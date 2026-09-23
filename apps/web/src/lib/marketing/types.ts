export type ContentType = "launch_post" | "teaser" | "quote_card";

export type Channel = "instagram" | "tiktok" | "x" | "facebook";

export type CampaignTone = "inspiring" | "playful" | "direct";

export type CampaignConfig = {
  objective: string;
  tone: CampaignTone;
  callToAction: string;
  includeHashtags: boolean;
};

export type Book = {
  id: string;
  title: string | null;
  cover_image: string | null;
  description: string | null;
  chapter_excerpt: string | null;
};

export type CampaignStatus = "draft" | "scheduled" | "active" | "finished";

export type Campaign = {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  updatedAt: string;
  channels: string[];
  budget?: string;
};

export type DistributionChannel = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type Metric = {
  id: string;
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "flat";
};

export type GeneratorOutput = {
  id: string;
  label: string;
  placeholder: string;
  sampleOutput: string;
};

export type ModuleState = "loading" | "empty" | "error" | "populated";
