import { describe, expect, it } from "vitest";
import { AGENT_RUN_CEILING_UNITS, estimateAgentRunUnits, projectNextTurnUnits, reconcileAgentRunUnits } from "./budget";

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
    // Holds only because the loop projects a turn before paying for it. While
    // the check was post-hoc the crossing turn was already billed, and a model
    // could pack one turn far past this.
    expect(AGENT_RUN_CEILING_UNITS).toBe(150_000 + 8 * 4_000);
    expect(estimateAgentRunUnits(50_000_000)).toBe(AGENT_RUN_CEILING_UNITS);
    expect(estimateAgentRunUnits(0)).toBeLessThan(AGENT_RUN_CEILING_UNITS);
  });

  it("treats a missing or negative size as an empty manuscript, not as free", () => {
    // Framing and output are paid whatever the book holds.
    expect(estimateAgentRunUnits(-1)).toBe(estimateAgentRunUnits(0));
    expect(estimateAgentRunUnits(0)).toBeGreaterThan(0);
  });
});

describe("reconcileAgentRunUnits", () => {
  it("charges the difference when a run cost more than it reserved", () => {
    // The measured shape of the gap: a search for a common substring fills the
    // conversation and is re-sent every turn, so the real bill can be several
    // times an opening reservation based on the book's size.
    expect(reconcileAgentRunUnits(76_000, { inputTokens: 200_100, outputTokens: 20_000 })).toBe(144_100);
  });

  it("charges nothing when the reservation already covered it", () => {
    expect(reconcileAgentRunUnits(76_000, { inputTokens: 11_000, outputTokens: 800 })).toBe(0);
    expect(reconcileAgentRunUnits(76_000, { inputTokens: 76_000, outputTokens: 0 })).toBe(0);
  });

  it("treats missing usage as nothing further to charge, never as a credit", () => {
    expect(reconcileAgentRunUnits(76_000, { inputTokens: 0, outputTokens: 0 })).toBe(0);
    expect(reconcileAgentRunUnits(0, { inputTokens: -5, outputTokens: -5 })).toBe(0);
  });
});

describe("projectNextTurnUnits", () => {
  it("prices the whole conversation, because the whole conversation is re-sent", () => {
    // Four search results of ~31 000 characters each: a few dozen output tokens
    // to ask for, and the next request carries all of it.
    expect(projectNextTurnUnits(124_000)).toBeGreaterThan(40_000);
    expect(projectNextTurnUnits(0)).toBe(2_800);
  });

  it("never returns a credit for an empty or negative conversation", () => {
    expect(projectNextTurnUnits(-1)).toBe(projectNextTurnUnits(0));
  });
});
