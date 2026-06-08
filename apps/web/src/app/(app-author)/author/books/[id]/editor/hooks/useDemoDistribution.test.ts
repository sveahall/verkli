/**
 * Unit tests for the Day 4 Distribution-façade hook. Same pattern as the
 * Day 3 useDemoProduction tests — exercise the pure planner + reducer in
 * node-env (no jsdom), cover the spec's three required angles:
 *   1. timing — kanal-by-kanal pacing windows hit, first event < 1 s
 *   2. completion-callback — state-machine transitions land correctly
 *   3. audio-trigger / coverage — every (channel, language) cell appears
 *      exactly once in the schedule.
 */

import { describe, expect, it } from "vitest";
import {
  cellKey,
  DEMO_CHANNELS,
  DEMO_DISTRIBUTION_LANGUAGES,
  DISTRIBUTION_PACING,
  planDistributionTimeline,
  reduceDemoDistribution,
  type DemoDistributionState,
  type DemoDistributionTimelineEvent,
} from "./useDemoDistribution";

function freshState(): DemoDistributionState {
  const cells: Record<string, boolean> = {};
  for (const ch of DEMO_CHANNELS) {
    for (const lang of DEMO_DISTRIBUTION_LANGUAGES) {
      cells[cellKey(ch, lang)] = false;
    }
  }
  return { status: "idle", cells, startedAt: null, completedAt: null };
}

describe("planDistributionTimeline (timing)", () => {
  it("guarantees the first thumbnail lands before 1 s regardless of jitter", () => {
    const timeline = planDistributionTimeline({
      cellJitter: () => DISTRIBUTION_PACING.rowJitterMs - 1, // worst-case jitter
    });
    const first = timeline.find(
      (e): e is Extract<DemoDistributionTimelineEvent, { kind: "cell_ready" }> =>
        e.kind === "cell_ready"
    );
    expect(first?.at).toBeLessThan(1000);
    expect(first?.channel).toBe("tiktok");
    expect(first?.language).toBe("sv");
  });

  it("places each channel's row inside its own pacing window", () => {
    const timeline = planDistributionTimeline({ cellJitter: () => 0 });
    for (const channel of DEMO_CHANNELS) {
      const window = DISTRIBUTION_PACING.rowWindows[channel];
      const rowEvents = timeline.filter(
        (e) => e.kind === "cell_ready" && e.channel === channel
      );
      for (const ev of rowEvents) {
        if (channel === "tiktok" && ev.kind === "cell_ready" && ev.language === "sv") {
          // First event lands at window.start exactly.
          expect(ev.at).toBe(window.start);
          continue;
        }
        expect(ev.at).toBeGreaterThanOrEqual(window.start);
        expect(ev.at).toBeLessThanOrEqual(window.end);
      }
    }
  });

  it("ends with `done` at the planned completion time and ascending order overall", () => {
    const timeline = planDistributionTimeline({ cellJitter: () => 0 });
    const last = timeline[timeline.length - 1];
    expect(last.kind).toBe("done");
    expect(last.at).toBe(DISTRIBUTION_PACING.completedAt);

    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].at).toBeGreaterThanOrEqual(timeline[i - 1].at);
    }
  });
});

describe("reduceDemoDistribution (completion-callback semantics)", () => {
  it("transitions idle → launching on start", () => {
    const next = reduceDemoDistribution(freshState(), {
      type: "start",
      startedAt: 9_000,
    });
    expect(next.status).toBe("launching");
    expect(next.startedAt).toBe(9_000);
    expect(next.completedAt).toBeNull();
    expect(Object.values(next.cells).every((v) => v === false)).toBe(true);
  });

  it("flips a single (channel, language) cell on cell_ready and ignores when not launching", () => {
    const launching = reduceDemoDistribution(freshState(), {
      type: "start",
      startedAt: 0,
    });
    const next = reduceDemoDistribution(launching, {
      type: "cell_ready",
      channel: "instagram",
      language: "en",
    });
    expect(next.cells[cellKey("instagram", "en")]).toBe(true);
    expect(next.cells[cellKey("tiktok", "sv")]).toBe(false);

    const idle = freshState();
    const noOp = reduceDemoDistribution(idle, {
      type: "cell_ready",
      channel: "instagram",
      language: "en",
    });
    expect(noOp).toBe(idle); // exact-same reference: nothing changed
  });

  it("transitions to done with completedAt and reset returns to initial", () => {
    const launching = reduceDemoDistribution(freshState(), {
      type: "start",
      startedAt: 0,
    });
    const done = reduceDemoDistribution(launching, {
      type: "done",
      completedAt: 17_500,
    });
    expect(done.status).toBe("done");
    expect(done.completedAt).toBe(17_500);

    const reset = reduceDemoDistribution(done, { type: "reset" });
    expect(reset.status).toBe("idle");
    expect(reset.startedAt).toBeNull();
    expect(reset.completedAt).toBeNull();
    expect(Object.values(reset.cells).every((v) => v === false)).toBe(true);
  });
});

describe("coverage", () => {
  it("schedules exactly one cell_ready event per (channel, language) cell", () => {
    const expectedCells = DEMO_CHANNELS.length * DEMO_DISTRIBUTION_LANGUAGES.length;
    const timeline = planDistributionTimeline({ cellJitter: () => 0 });
    const cellEvents = timeline.filter((e) => e.kind === "cell_ready");
    expect(cellEvents).toHaveLength(expectedCells);

    const seen = new Set<string>();
    for (const ev of cellEvents) {
      if (ev.kind !== "cell_ready") continue;
      const key = cellKey(ev.channel, ev.language);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(expectedCells);
  });
});
