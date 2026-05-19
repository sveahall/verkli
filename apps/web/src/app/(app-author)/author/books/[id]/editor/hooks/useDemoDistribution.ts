"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The 4 social channels the investor-pitch demo claims it can launch into
 * simultaneously. Order is meaningful — it drives the row order on screen
 * AND the kanal-by-kanal pacing window. Mirrors the channel column on
 * marketing_campaigns and the social-thumbnail aspect map in
 * scripts/generate-demo-social-thumbs.ts.
 */
export const DEMO_CHANNELS = [
  "tiktok",
  "instagram",
  "x",
  "youtube",
] as const;

export type DemoChannel = (typeof DEMO_CHANNELS)[number];

/**
 * The 3 launch languages — matches MARKETING_LANGUAGES in
 * scripts/seed-investor-demo.ts (sv/en/fr) and the 12 marketing_campaigns
 * rows seeded against the demo book.
 */
export const DEMO_DISTRIBUTION_LANGUAGES = ["sv", "en", "fr"] as const;
export type DemoDistributionLanguage = (typeof DEMO_DISTRIBUTION_LANGUAGES)[number];

/**
 * Pacing schedule. Spec from the Day 4 plan:
 *   < 1s    first thumbnail visible
 *   0–3s    TikTok row fills (first thumb at 200 ms so it lands < 1 s)
 *   3–7s    Instagram row fills
 *   7–12s   X row fills
 *   12–17s  YouTube Shorts row fills
 *   ~17s    overall complete; SummaryOverlay can mount
 *
 * Within each row, the 3 language cells stagger with random 0-500 ms
 * jitter on top of the row's base offset, so the reveal feels organic
 * instead of metronomic. Hard rule: no >3 s gap without a visible change.
 */
export const DISTRIBUTION_PACING = {
  rowWindows: {
    tiktok: { start: 200, end: 3000 },
    instagram: { start: 3000, end: 7000 },
    x: { start: 7000, end: 12000 },
    youtube: { start: 12000, end: 17000 },
  } as const,
  rowJitterMs: 500,
  completedAt: 17500,
} as const;

export interface DemoDistributionCellKey {
  channel: DemoChannel;
  language: DemoDistributionLanguage;
}

export type DemoDistributionStatus = "idle" | "launching" | "done";

export interface DemoDistributionState {
  status: DemoDistributionStatus;
  /** key = `${channel}:${language}` → boolean ready */
  cells: Record<string, boolean>;
  startedAt: number | null;
  completedAt: number | null;
}

export type DemoDistributionTimelineEvent =
  | { kind: "cell_ready"; at: number; channel: DemoChannel; language: DemoDistributionLanguage }
  | { kind: "done"; at: number };

export type DemoDistributionAction =
  | { type: "start"; startedAt: number }
  | { type: "cell_ready"; channel: DemoChannel; language: DemoDistributionLanguage }
  | { type: "done"; completedAt: number }
  | { type: "reset" };

export interface DemoDistributionTelemetryEvent {
  event: string;
  t: number;
  channel?: DemoChannel;
  language?: DemoDistributionLanguage;
}

export const DISTRIBUTION_TELEMETRY_KEY = "demo_telemetry";
export const DISTRIBUTION_STATE_KEY = "demo_distribution_state";
export const DISTRIBUTION_RESUME_WINDOW_MS = 30_000;

/** Pure helper: remaining events after `elapsedMs` of the full timeline. */
export function remainingDistributionTimeline(
  fullTimeline: ReadonlyArray<DemoDistributionTimelineEvent>,
  elapsedMs: number
): DemoDistributionTimelineEvent[] {
  return fullTimeline
    .filter((event) => event.at > elapsedMs)
    .map((event) => ({ ...event, at: event.at - elapsedMs }));
}

export function cellKey(channel: DemoChannel, language: DemoDistributionLanguage): string {
  return `${channel}:${language}`;
}

function emptyCells(): Record<string, boolean> {
  const cells: Record<string, boolean> = {};
  for (const ch of DEMO_CHANNELS) {
    for (const lang of DEMO_DISTRIBUTION_LANGUAGES) {
      cells[cellKey(ch, lang)] = false;
    }
  }
  return cells;
}

const initialState: DemoDistributionState = {
  status: "idle",
  cells: emptyCells(),
  startedAt: null,
  completedAt: null,
};

export interface PlanDistributionTimelineArgs {
  /** Optional deterministic jitter per (channel, language). Tests pass () => 0; production passes Math.random()*max. */
  cellJitter?: (channel: DemoChannel, language: DemoDistributionLanguage, indexInRow: number) => number;
}

/**
 * Build the chronological event list. Pure — the hook converts each entry
 * into a setTimeout, tests inspect the schedule directly.
 *
 * Guarantee: the very first cell event lands at exactly
 * `rowWindows.tiktok.start` (200 ms) regardless of jitter, so investors
 * always see "first post in well under 1 s". Subsequent cells in each
 * row distribute evenly across the row window with jitter on top.
 */
export function planDistributionTimeline(
  args: PlanDistributionTimelineArgs = {}
): DemoDistributionTimelineEvent[] {
  const events: DemoDistributionTimelineEvent[] = [];
  const jitter = args.cellJitter ?? (() => 0);

  for (const channel of DEMO_CHANNELS) {
    const window = DISTRIBUTION_PACING.rowWindows[channel];
    const span = window.end - window.start;
    const slot = span / DEMO_DISTRIBUTION_LANGUAGES.length;
    DEMO_DISTRIBUTION_LANGUAGES.forEach((language, idx) => {
      const isFirstOverall = channel === "tiktok" && idx === 0;
      const at = isFirstOverall
        ? window.start
        : window.start + idx * slot + jitter(channel, language, idx);
      events.push({ kind: "cell_ready", at, channel, language });
    });
  }
  events.push({ kind: "done", at: DISTRIBUTION_PACING.completedAt });

  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map(({ e }) => e);
}

export function reduceDemoDistribution(
  state: DemoDistributionState,
  action: DemoDistributionAction
): DemoDistributionState {
  switch (action.type) {
    case "start":
      return {
        status: "launching",
        cells: emptyCells(),
        startedAt: action.startedAt,
        completedAt: null,
      };
    case "cell_ready":
      if (state.status !== "launching") return state;
      return {
        ...state,
        cells: { ...state.cells, [cellKey(action.channel, action.language)]: true },
      };
    case "done":
      return { ...state, status: "done", completedAt: action.completedAt };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

export interface DemoDistributionDeps {
  schedule: (ms: number, fn: () => void) => () => void;
  now: () => number;
  playSuccessPing: () => void;
  recordTelemetry: (event: DemoDistributionTelemetryEvent) => void;
}

const defaultDeps: DemoDistributionDeps = {
  schedule(ms, fn) {
    if (typeof window === "undefined") return () => undefined;
    const id = window.setTimeout(fn, ms);
    return () => window.clearTimeout(id);
  },
  now() {
    return Date.now();
  },
  playSuccessPing() {
    if (typeof window === "undefined") return;
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      // A slightly higher pitch than the production-façade ping so the two
      // demos sound distinct when an investor sees Day 3 → Day 4 in sequence.
      osc.frequency.value = 1100;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.005);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
      osc.onended = () => {
        ctx.close().catch(() => undefined);
      };
    } catch {
      // best-effort
    }
  },
  recordTelemetry(event) {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DISTRIBUTION_TELEMETRY_KEY);
      const list = raw ? (JSON.parse(raw) as DemoDistributionTelemetryEvent[]) : [];
      list.push(event);
      const trimmed = list.length > 200 ? list.slice(list.length - 200) : list;
      window.localStorage.setItem(DISTRIBUTION_TELEMETRY_KEY, JSON.stringify(trimmed));
    } catch {
      // best-effort
    }
  },
};

interface DemoDistributionOptions {
  deps?: Partial<DemoDistributionDeps>;
}

export interface UseDemoDistributionResult {
  state: DemoDistributionState;
  start: () => void;
  reset: () => void;
}

export function useDemoDistribution(
  options: DemoDistributionOptions = {}
): UseDemoDistributionResult {
  const deps: DemoDistributionDeps = useMemo(
    () => ({ ...defaultDeps, ...(options.deps ?? {}) }),
    [options.deps]
  );

  // Lazy-init from localStorage so refresh-during-pacing resumes the
  // animation instead of restarting from idle.
  const [state, setState] = useState<DemoDistributionState>(() => {
    if (typeof window === "undefined") return initialState;
    try {
      const raw = window.localStorage.getItem(DISTRIBUTION_STATE_KEY);
      if (!raw) return initialState;
      const parsed = JSON.parse(raw) as DemoDistributionState;
      if (
        parsed.status === "launching" &&
        typeof parsed.startedAt === "number" &&
        Date.now() - parsed.startedAt < DISTRIBUTION_RESUME_WINDOW_MS
      ) {
        return parsed;
      }
      return initialState;
    } catch {
      return initialState;
    }
  });
  const cancelHandlesRef = useRef<Array<() => void>>([]);
  // Resume-effect guard — see the matching pattern in useDemoProduction.
  const hasResumedRef = useRef(false);

  // Persist state on every change. Cleared on reset.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (state.status === "idle") {
        window.localStorage.removeItem(DISTRIBUTION_STATE_KEY);
      } else {
        window.localStorage.setItem(DISTRIBUTION_STATE_KEY, JSON.stringify(state));
      }
    } catch {
      // best-effort
    }
  }, [state]);

  const cancelPending = useCallback(() => {
    for (const cancel of cancelHandlesRef.current) {
      try {
        cancel();
      } catch {
        // ignore
      }
    }
    cancelHandlesRef.current = [];
  }, []);

  useEffect(() => {
    return () => cancelPending();
  }, [cancelPending]);

  // Resume effect: if we lazy-hydrated an in-flight session, re-schedule
  // remaining cell-flip + done events so pacing continues smoothly. The
  // hasResumedRef guard keeps the work idempotent across re-renders.
  useEffect(() => {
    if (hasResumedRef.current) return;
    if (state.status !== "launching" || state.startedAt == null) return;
    hasResumedRef.current = true;
    const elapsed = deps.now() - state.startedAt;
    if (elapsed >= DISTRIBUTION_PACING.completedAt) {
      // Defer the close-out so the state transition happens after this
      // effect returns instead of as a synchronous setState in body.
      const cancel = deps.schedule(0, () => {
        setState((prev) =>
          reduceDemoDistribution(prev, { type: "done", completedAt: deps.now() })
        );
      });
      cancelHandlesRef.current.push(cancel);
      return;
    }
    const fullTimeline = planDistributionTimeline({ cellJitter: () => 0 });
    const remaining = remainingDistributionTimeline(fullTimeline, elapsed);
    for (const event of remaining) {
      const cancel = deps.schedule(event.at, () => {
        if (event.kind === "cell_ready") {
          setState((prev) =>
            reduceDemoDistribution(prev, {
              type: "cell_ready",
              channel: event.channel,
              language: event.language,
            })
          );
        } else {
          setState((prev) =>
            reduceDemoDistribution(prev, { type: "done", completedAt: deps.now() })
          );
        }
      });
      cancelHandlesRef.current.push(cancel);
    }
  }, [deps, state.status, state.startedAt]);

  const reset = useCallback(() => {
    cancelPending();
    setState((prev) => reduceDemoDistribution(prev, { type: "reset" }));
  }, [cancelPending]);

  const start = useCallback(() => {
    cancelPending();
    const startedAt = deps.now();
    setState((prev) => reduceDemoDistribution(prev, { type: "start", startedAt }));
    deps.recordTelemetry({ event: "start", t: 0 });

    const timeline = planDistributionTimeline({
      cellJitter: () => Math.floor(Math.random() * DISTRIBUTION_PACING.rowJitterMs),
    });

    for (const event of timeline) {
      const cancel = deps.schedule(event.at, () => {
        if (event.kind === "cell_ready") {
          setState((prev) =>
            reduceDemoDistribution(prev, {
              type: "cell_ready",
              channel: event.channel,
              language: event.language,
            })
          );
          deps.recordTelemetry({
            event: "cell_ready",
            t: deps.now() - startedAt,
            channel: event.channel,
            language: event.language,
          });
          deps.playSuccessPing();
        } else {
          const completedAt = deps.now();
          setState((prev) =>
            reduceDemoDistribution(prev, { type: "done", completedAt })
          );
          deps.recordTelemetry({ event: "done", t: completedAt - startedAt });
          deps.playSuccessPing();
        }
      });
      cancelHandlesRef.current.push(cancel);
    }
  }, [cancelPending, deps]);

  return { state, start, reset };
}
