import { describe, expect, it } from "vitest";
import type { Plan, PlannedMatch } from "@/lib/ai/agent-runtime/plan";
import { initialTicked, planSelection, resultHeading } from "./AgentPlanCard";

const match = (matchId: string, preselected: boolean): PlannedMatch => ({
  matchId, chapterId: "c1", chapterTitle: "Hamnen", chapterHash: "h",
  from: 1, to: 6, text: "Johan", before: "", after: " gick.", replacement: "Jonas", preselected,
});

const plan: Plan = {
  versionId: "00000000-0000-4000-8000-0000000000ff",
  steps: [
    { id: "s1", tool: "replace_in_book", reason: "Rename.", replacement: "Jonas", matches: [match("m1", true), match("m2", true), match("m3", false)] },
    { id: "s2", tool: "set_cover_text", reason: "Back copy.", fields: { backText: "En roman." } },
  ],
};

describe("plan approval", () => {
  it("starts with the agent's confident matches ticked and its uncertain one not", () => {
    expect([...initialTicked(plan)]).toEqual(["m1", "m2"]);
  });

  it("sends the ticked matches and every step that still has work", () => {
    expect(planSelection(plan, initialTicked(plan), new Set())).toEqual({
      stepIds: ["s1", "s2"], matchIds: ["m1", "m2"],
    });
  });

  it("drops a replacement step once the author unticks its last match", () => {
    // Otherwise the approval would carry a step with nothing to do, and the
    // author would be told a change was applied that never touched anything.
    expect(planSelection(plan, new Set(), new Set())).toEqual({ stepIds: ["s2"], matchIds: [] });
  });

  it("honours a step the author excluded outright", () => {
    expect(planSelection(plan, initialTicked(plan), new Set(["s2"]))).toEqual({
      stepIds: ["s1"], matchIds: ["m1", "m2"],
    });
  });

  it("carries a match the author opted into", () => {
    expect(planSelection(plan, new Set(["m3"]), new Set(["s2"]))).toEqual({ stepIds: ["s1"], matchIds: ["m3"] });
  });
});

describe("result heading", () => {
  it("counts passages when the write changed them", () => {
    expect(resultHeading({ changed: 1, outcomes: [{ status: "applied" }] })).toBe("1 passage changed");
    expect(resultHeading({ changed: 2, outcomes: [{ status: "applied" }] })).toBe("2 passages changed");
  });

  it("does not call a saved cover nothing", () => {
    expect(resultHeading({ changed: 0, outcomes: [{ status: "applied" }] })).toBe("1 change saved");
    expect(resultHeading({ changed: 0, outcomes: [{ status: "applied" }, { status: "applied" }] })).toBe("2 changes saved");
  });

  it("says nothing only when every step was skipped or failed", () => {
    expect(resultHeading({ changed: 0, outcomes: [{ status: "skipped" }, { status: "failed" }] })).toBe("Nothing was changed");
  });
});
