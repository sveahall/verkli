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

export type Channel = {
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
