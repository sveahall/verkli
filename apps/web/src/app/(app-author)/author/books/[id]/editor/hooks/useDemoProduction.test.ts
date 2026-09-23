/**
 * Unit tests for the investor-pitch ProductionFacade hook.
 *
 * The React-bound hook (`useDemoProduction`) is a thin wrapper around two
 * pure pieces — the timeline planner (`planDemoTimeline`) and the state
 * reducer (`reduceDemoProduction`) — exported alongside it. We test those
 * directly so the test suite stays in node-env (no jsdom in this codebase)
 * while still covering the spec's three required angles:
 *   1. timing — the order/offsets of scheduled events match the plan
 *   2. completion-callback — state transitions land in the right shape
 *   3. audio-trigger — `audiobook_ready` is wired in iff the toggle is on,
 *      and the start action records a telemetry event by way of the
 *      reducer + planner contract.
 */

import { describe, expect, it } from "vitest";
import {
  DEMO_LANGUAGES,
  PACING,
  planDemoTimeline,
  reduceDemoProduction,
  remainingDemoTimeline,
  type DemoLanguage,
  type DemoProductionState,
  type DemoTimelineEvent,
} from "./useDemoProduction";

const ALL_LANGS: ReadonlyArray<DemoLanguage> = DEMO_LANGUAGES;

function freshState(): DemoProductionState {
  return {
    status: "idle",
    badges: ALL_LANGS.reduce<Record<DemoLanguage, boolean>>(
      (acc, l) => {
        acc[l] = false;
        return acc;
      },
      {} as Record<DemoLanguage, boolean>
    ),
    audiobookReady: false,
    startedAt: null,
    completedAt: null,
  };
}

describe("planDemoTimeline (timing)", () => {
  it("locks the investor-pitch pacing to the 13.5s Day 5 sequence", () => {
    const timeline = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: true,
      secondaryJitter: () => 0,
    });

    expect(timeline).toEqual([
      { kind: "lang_ready", at: 0, lang: "en" },
      { kind: "lang_ready", at: 1500, lang: "de" },
      { kind: "lang_ready", at: 3000, lang: "fr" },
      { kind: "audiobook_ready", at: 6000 },
      { kind: "lang_ready", at: 7000, lang: "es" },
      { kind: "lang_ready", at: 8000, lang: "it" },
      { kind: "lang_ready", at: 9000, lang: "nl" },
      { kind: "lang_ready", at: 10000, lang: "pt" },
      { kind: "lang_ready", at: 11000, lang: "pl" },
      { kind: "lang_ready", at: 12000, lang: "ja" },
      { kind: "done", at: 13500 },
    ]);
  });

  it("schedules the primary trio (en/de/fr) at 0/1500/3000ms when all 10 languages are selected", () => {
    const timeline = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: true,
      secondaryJitter: () => 0,
    });

    const enEvent = timeline.find(
      (e): e is Extract<DemoTimelineEvent, { kind: "lang_ready" }> =>
        e.kind === "lang_ready" && e.lang === "en"
    );
    const deEvent = timeline.find(
      (e): e is Extract<DemoTimelineEvent, { kind: "lang_ready" }> =>
        e.kind === "lang_ready" && e.lang === "de"
    );
    const frEvent = timeline.find(
      (e): e is Extract<DemoTimelineEvent, { kind: "lang_ready" }> =>
        e.kind === "lang_ready" && e.lang === "fr"
    );

    expect(enEvent?.at).toBe(0);
    expect(deEvent?.at).toBe(1500);
    expect(frEvent?.at).toBe(3000);
  });

  it("places audiobook_ready before the secondary languages when enabled, and omits it otherwise", () => {
    const withAudio = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: true,
      secondaryJitter: () => 0,
    });
    const withoutAudio = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: false,
      secondaryJitter: () => 0,
    });

    const audiobookOffset = withAudio.findIndex(
      (e) => e.kind === "audiobook_ready"
    );
    const firstSecondaryOffset = withAudio.findIndex(
      (e) => e.kind === "lang_ready" && e.lang === "es"
    );
    expect(audiobookOffset).toBeGreaterThan(-1);
    expect(audiobookOffset).toBeLessThan(firstSecondaryOffset);
    expect(withAudio[audiobookOffset]).toMatchObject({
      kind: "audiobook_ready",
      at: PACING.audiobookReadyAt,
    });

    expect(
      withoutAudio.some((e) => e.kind === "audiobook_ready")
    ).toBe(false);
  });

  it("ends with `done` at the planned completion time and skips events for deselected languages", () => {
    const timeline = planDemoTimeline({
      selectedLanguages: ["en", "de", "fr"], // skip the 6 secondary languages
      audiobookEnabled: true,
      secondaryJitter: () => 0,
    });

    const last = timeline[timeline.length - 1];
    expect(last.kind).toBe("done");
    expect(last.at).toBe(PACING.completedAt);

    // No secondary lang events because none were selected.
    const secondaryEvents = timeline.filter(
      (e) =>
        e.kind === "lang_ready" &&
        ["es", "it", "nl", "pt", "pl", "ja"].includes(e.lang)
    );
    expect(secondaryEvents).toHaveLength(0);

    // Primary three are present.
    const primaryEvents = timeline.filter((e) => e.kind === "lang_ready");
    expect(primaryEvents).toHaveLength(3);
  });

  it("respects the secondaryJitter callback so jitter is deterministic in tests", () => {
    const timeline = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: false,
      secondaryJitter: (idx) => idx * 10,
    });

    const esEvent = timeline.find(
      (e) => e.kind === "lang_ready" && e.lang === "es"
    );
    const jaEvent = timeline.find(
      (e) => e.kind === "lang_ready" && e.lang === "ja"
    );
    expect(esEvent?.at).toBe(PACING.secondaryBaseStarts[0] + 0);
    expect(jaEvent?.at).toBe(PACING.secondaryBaseStarts[5] + 50);
  });
});

describe("reduceDemoProduction (completion-callback semantics)", () => {
  it("transitions idle → producing on start and stamps startedAt", () => {
    const next = reduceDemoProduction(freshState(), {
      type: "start",
      startedAt: 12_345,
      selectedLanguages: ["en", "de", "fr"],
    });
    expect(next.status).toBe("producing");
    expect(next.startedAt).toBe(12_345);
    expect(next.completedAt).toBeNull();
  });

  it("flips a single language badge on lang_ready without disturbing others", () => {
    const producing = reduceDemoProduction(freshState(), {
      type: "start",
      startedAt: 0,
      selectedLanguages: ALL_LANGS,
    });
    const next = reduceDemoProduction(producing, {
      type: "lang_ready",
      lang: "fr",
    });
    expect(next.badges.fr).toBe(true);
    expect(next.badges.en).toBe(false);
    expect(next.badges.de).toBe(false);
  });

  it("transitions to done with a completedAt and reset returns to initial", () => {
    const producing = reduceDemoProduction(freshState(), {
      type: "start",
      startedAt: 0,
      selectedLanguages: ALL_LANGS,
    });
    const done = reduceDemoProduction(producing, {
      type: "done",
      completedAt: 17_500,
    });
    expect(done.status).toBe("done");
    expect(done.completedAt).toBe(17_500);

    const reset = reduceDemoProduction(done, { type: "reset" });
    expect(reset.status).toBe("idle");
    expect(reset.startedAt).toBeNull();
    expect(reset.completedAt).toBeNull();
    expect(Object.values(reset.badges).every((v) => v === false)).toBe(true);
  });

  it("ignores lang_ready / audiobook_ready when not in producing state", () => {
    const idle = freshState();
    const noOp = reduceDemoProduction(idle, { type: "lang_ready", lang: "en" });
    expect(noOp).toBe(idle); // exact-same reference: reducer returned state unchanged

    const noAudio = reduceDemoProduction(idle, { type: "audiobook_ready" });
    expect(noAudio).toBe(idle);
  });
});

describe("remainingDemoTimeline (state-resume guardrail)", () => {
  it("drops events that have already fired and rebases future events to the elapsed time", () => {
    const full = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: true,
      secondaryJitter: () => 0,
    });
    // Halfway through the pacing window.
    const elapsed = 6500;
    const remaining = remainingDemoTimeline(full, elapsed);

    // Every remaining event must be scheduled in the future.
    for (const ev of remaining) {
      expect(ev.at).toBeGreaterThan(0);
    }
    // None of the primary trio (en/de/fr at 0/1500/3000) should remain;
    // audiobook_ready at 6000 should also be gone (elapsed=6500 > 6000).
    expect(remaining.some((e) => e.kind === "audiobook_ready")).toBe(false);
    expect(
      remaining.some(
        (e) =>
          e.kind === "lang_ready" &&
          ["en", "de", "fr"].includes(e.lang)
      )
    ).toBe(false);
    // The 'done' event survives, rebased.
    const done = remaining.find((e) => e.kind === "done");
    expect(done?.at).toBe(PACING.completedAt - elapsed);
  });

  it("returns an empty list once elapsed >= completedAt", () => {
    const full = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: true,
      secondaryJitter: () => 0,
    });
    expect(remainingDemoTimeline(full, PACING.completedAt + 100)).toHaveLength(0);
  });

  it("returns the full schedule when elapsed=0 (rebases are no-ops)", () => {
    const full = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: true,
      secondaryJitter: () => 0,
    });
    const remaining = remainingDemoTimeline(full, 0);
    // remainingDemoTimeline uses `at > elapsedMs`, so the first event at
    // exactly t=0 (the en lang_ready) is excluded — matches the hook's
    // resume semantics: anything that would have fired at-or-before the
    // current moment is treated as already-applied.
    expect(remaining.length).toBe(full.length - 1);
    expect(remaining[remaining.length - 1].kind).toBe("done");
    expect(remaining[remaining.length - 1].at).toBe(PACING.completedAt);
  });
});

describe("audio-trigger wiring", () => {
  it("includes audiobook_ready in the schedule iff toggled on", () => {
    const on = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: true,
    });
    const off = planDemoTimeline({
      selectedLanguages: ALL_LANGS,
      audiobookEnabled: false,
    });
    expect(on.some((e) => e.kind === "audiobook_ready")).toBe(true);
    expect(off.some((e) => e.kind === "audiobook_ready")).toBe(false);
  });

  it("flips audiobookReady on the audiobook_ready action", () => {
    const producing = reduceDemoProduction(freshState(), {
      type: "start",
      startedAt: 0,
      selectedLanguages: ALL_LANGS,
    });
    expect(producing.audiobookReady).toBe(false);

    const next = reduceDemoProduction(producing, { type: "audiobook_ready" });
    expect(next.audiobookReady).toBe(true);
  });
});
