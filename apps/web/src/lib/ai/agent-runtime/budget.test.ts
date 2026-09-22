import { describe, expect, it } from "vitest";
import { AGENT_RUN_CEILING_UNITS, estimateAgentRunUnits } from "./budget";

describe("estimateAgentRunUnits", () => {
  it("reserves more than a real run costs, without being absurd about it", () => {
    // A measured run over a two-chapter book was ~11 800 tokens in and out.
    const measured = 11_800;
    const estimate = estimateAgentRunUnits(600);
    expect(estimate).toBeGreaterThan(measured);
    expect(estimate).toBeLessThan(measured * 6);
  });

  it("grows with the manuscript, because every turn re-sends what the tools found", () => {
    expect(estimateAgentRunUnits(200_000)).toBeGreaterThan(estimateAgentRunUnits(20_000));
  });

  it("never reserves more than the loop could spend", () => {
    expect(estimateAgentRunUnits(50_000_000)).toBe(AGENT_RUN_CEILING_UNITS);
    expect(estimateAgentRunUnits(0)).toBeLessThan(AGENT_RUN_CEILING_UNITS);
  });

  it("treats a missing or negative size as an empty manuscript, not as free", () => {
    // Framing and output are paid whatever the book holds.
    expect(estimateAgentRunUnits(-1)).toBe(estimateAgentRunUnits(0));
    expect(estimateAgentRunUnits(0)).toBeGreaterThan(0);
  });
});
