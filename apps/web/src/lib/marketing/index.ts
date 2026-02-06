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

// Mock data (temporary until backend implementation)
export {
  campaigns,
  channels,
  metrics,
  generatorOutputs,
} from "./mockData";
