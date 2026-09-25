import { describe, expect, it } from "vitest";
import { buildDefaultSchedule } from "./CampaignWizard.state";
import type { ChannelId } from "./CampaignWizard.config";
describe("campaign planning", () => {
  it("includes every chosen channel even at the lowest frequency", () => {
    const channels = new Set<ChannelId>(["instagram", "tiktok", "youtube", "facebook", "x", "threads"]);
    const plan = buildDefaultSchedule(channels, "1-3");
    expect(new Set([...plan.values()].flat())).toEqual(channels);
  });
});
