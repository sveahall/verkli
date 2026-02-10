/**
 * Marketing module re-exports.
 * Usage: import { campaigns, type Campaign } from "@/lib/marketing";
 */

// Types
export type {
  Campaign,
  CampaignStatus,
  Channel,
  Metric,
  GeneratorOutput,
  ModuleState,
} from "./types";

export type { CaptionChannel, ContentType, CaptionConfig } from "./caption-generator";

// Mock data (temporary until backend implementation)
export {
  campaigns,
  channels,
  metrics,
  generatorOutputs,
} from "./mockData";
