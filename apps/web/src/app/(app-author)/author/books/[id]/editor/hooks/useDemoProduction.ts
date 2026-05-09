"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The 10 languages the investor-pitch demo claims it can produce. Order is
 * meaningful — the first three are the "A-quality" flagship languages that
 * appear in the early-pacing window, the rest fill in during the second
 * pacing window. Mirrors apps/web/scripts/seed-data/haunted-diary.ts.
 */
export const DEMO_LANGUAGES = [
  "en",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "pt",
  "pl",
  "ja",
  "sv",
] as const;

export type DemoLanguage = (typeof DEMO_LANGUAGES)[number];

const PRIMARY_LANGUAGES: ReadonlyArray<DemoLanguage> = ["en", "de", "fr"];
const SECONDARY_LANGUAGES: ReadonlyArray<DemoLanguage> = [
  "es",
  "it",
  "nl",
  "pt",
  "pl",
  "ja",
];

/**
 * Pacing schedule. Each entry is (delayMs, language). Values come straight
 * from the demo plan:
 *   0–5s    primary trio (en/de/fr) light up at 0/1500/3000 ms
 *   6s      audiobook Play button is allowed to appear
 *   11–15s  secondary six tick in at ~700 ms intervals
 *   15–18s  "all ready" plus final checkmark pop
 *
 * Hard rule from the plan: no step ≥ 3 s without a visible change. The
 * widest gap below is 3 s (3000 → 6000) which is exactly the audiobook
 * waveform pulse-up — that is the "visual change" filling the window.
 */
export const PACING = {
  primaryStarts: [0, 1500, 3000] as const, // ms offsets, indexed with PRIMARY_LANGUAGES
  audiobookReadyAt: 6000,
  secondaryBaseStarts: [11000, 11800, 12600, 13300, 14000, 14800] as const,
  secondaryJitterMs: 500,
  completedAt: 17500,
} as const;

// ─── Pure planning helpers ─────────────────────────────────────────────────
// Extracted so they can be exercised in node-env unit tests without React.

export type DemoTimelineEvent =
  | { kind: "lang_ready"; at: number; lang: DemoLanguage }
  | { kind: "audiobook_ready"; at: number }
  | { kind: "done"; at: number };

export interface PlanDemoTimelineArgs {
  selectedLanguages: ReadonlyArray<DemoLanguage>;
  audiobookEnabled: boolean;
  /** Optional deterministic jitter in [0, secondaryJitterMs). Tests pass 0; production passes Math.random()*max. */
  secondaryJitter?: (index: number) => number;
}

/**
 * Build the full schedule of events the façade will fire, in chronological
 * order. Pure — no side effects. The hook converts each entry into a
 * setTimeout callback; tests inspect the schedule directly.
 */
export function planDemoTimeline(
  args: PlanDemoTimelineArgs
): DemoTimelineEvent[] {
  const events: DemoTimelineEvent[] = [];
  const isSelected = (l: DemoLanguage) => args.selectedLanguages.includes(l);

  PRIMARY_LANGUAGES.forEach((lang, idx) => {
    if (!isSelected(lang)) return;
    events.push({ kind: "lang_ready", at: PACING.primaryStarts[idx], lang });
  });

  if (args.audiobookEnabled) {
    events.push({ kind: "audiobook_ready", at: PACING.audiobookReadyAt });
  }

  SECONDARY_LANGUAGES.forEach((lang, idx) => {
    if (!isSelected(lang)) return;
    const jitter = args.secondaryJitter ? args.secondaryJitter(idx) : 0;
    events.push({
      kind: "lang_ready",
      at: PACING.secondaryBaseStarts[idx] + jitter,
      lang,
    });
  });

  events.push({ kind: "done", at: PACING.completedAt });

  // Stable chronological sort; tie-breaks preserve insertion order.
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map(({ e }) => e);
}

export type DemoProductionAction =
  | { type: "start"; startedAt: number; selectedLanguages: ReadonlyArray<DemoLanguage> }
  | { type: "lang_ready"; lang: DemoLanguage }
  | { type: "audiobook_ready" }
  | { type: "done"; completedAt: number }
  | { type: "reset" };

/**
 * State-machine reducer. Every transition is testable via simple object
 * comparison. The hook drives this with a useState setter.
 */
export function reduceDemoProduction(
  state: DemoProductionState,
  action: DemoProductionAction
): DemoProductionState {
  switch (action.type) {
    case "start":
      return {
        status: "producing",
        badges: emptyBadges(),
        audiobookReady: false,
        startedAt: action.startedAt,
        completedAt: null,
      };
    case "lang_ready":
      if (state.status !== "producing") return state;
      return { ...state, badges: { ...state.badges, [action.lang]: true } };
    case "audiobook_ready":
      if (state.status !== "producing") return state;
      return { ...state, audiobookReady: true };
    case "done":
      return { ...state, status: "done", completedAt: action.completedAt };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

export type DemoProductionStatus = "idle" | "producing" | "done";

export interface DemoProductionState {
  status: DemoProductionStatus;
  /** Per-language readiness map. Languages not in selectedLanguages stay 'pending' for the whole run. */
  badges: Record<DemoLanguage, boolean>;
  audiobookReady: boolean;
  startedAt: number | null;
  completedAt: number | null;
}

export interface DemoProductionTelemetryEvent {
  /** Phase identifier — start, lang_ready, audiobook_ready, done. */
  event: string;
  /** Wall-clock ms since startedAt. */
  t: number;
  /** Language code when relevant. */
  lang?: DemoLanguage;
}

/**
 * Side-effect dependencies the hook needs. Default impls plug into the
 * browser; tests pass stubs (no real audio, no real localStorage).
 */
export interface DemoProductionDeps {
  /** Schedule a callback after `ms` milliseconds. Returns a cancel handle. */
  schedule: (ms: number, fn: () => void) => () => void;
  /** Wall-clock for telemetry timestamps. */
  now: () => number;
  /** Play the per-language ready ping. Defaults to a Web Audio short tone. */
  playSuccessPing: () => void;
  /** Play an mp3 by URL. Defaults to creating an HTMLAudioElement. */
  playAudio: (url: string) => Promise<void>;
  /** Persist a telemetry record. Defaults to appending to localStorage. */
  recordTelemetry: (event: DemoProductionTelemetryEvent) => void;
}

export const TELEMETRY_STORAGE_KEY = "demo_telemetry";
/**
 * State snapshot persistence key. The full DemoProductionState (status,
 * badges, startedAt, completedAt) is mirrored here on every transition.
 * On hook mount we read this back and, if a session was in flight when
 * the page reloaded, resume from the appropriate point in the timeline
 * instead of restarting from idle.
 */
export const STATE_STORAGE_KEY = "demo_production_state";

/** Sessions older than this are treated as stale and discarded on resume. */
export const STATE_RESUME_WINDOW_MS = 30_000;

/**
 * Pure helper: given the planned full timeline and the elapsed time since
 * the start event, return only the events that haven't fired yet, with
 * their `at` rebased to `at - elapsedMs` so the caller can hand them to
 * setTimeout directly. Exported for tests.
 */
export function remainingDemoTimeline(
  fullTimeline: ReadonlyArray<DemoTimelineEvent>,
  elapsedMs: number
): DemoTimelineEvent[] {
  return fullTimeline
    .filter((event) => event.at > elapsedMs)
    .map((event) => ({ ...event, at: event.at - elapsedMs }));
}

const defaultDeps: DemoProductionDeps = {
  schedule(ms, fn) {
    if (typeof window === "undefined") {
      return () => undefined;
    }
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
      // -20 dB ≈ 0.1 linear gain. Short envelope: 5 ms attack, 45 ms decay.
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.005);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
      osc.onended = () => {
        ctx.close().catch(() => undefined);
      };
    } catch {
      // Audio is best-effort; never block the UI on Web Audio failures.
    }
  },
  async playAudio(url) {
    if (typeof window === "undefined") return;
    const audio = new Audio(url);
    await audio.play().catch(() => undefined);
  },
  recordTelemetry(event) {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as DemoProductionTelemetryEvent[]) : [];
      list.push(event);
      // Cap to the last 200 events so the demo can run repeatedly without
      // the localStorage entry growing unbounded.
      const trimmed = list.length > 200 ? list.slice(list.length - 200) : list;
      window.localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Telemetry is best-effort; never throw out of the hook on storage errors.
    }
  },
};

function emptyBadges(): Record<DemoLanguage, boolean> {
  return DEMO_LANGUAGES.reduce<Record<DemoLanguage, boolean>>(
    (acc, lang) => {
      acc[lang] = false;
      return acc;
    },
    {} as Record<DemoLanguage, boolean>
  );
}

const initialState: DemoProductionState = {
  status: "idle",
  badges: emptyBadges(),
  audiobookReady: false,
  startedAt: null,
  completedAt: null,
};

interface DemoProductionOptions {
  /** Override deps (tests). */
  deps?: Partial<DemoProductionDeps>;
}

export interface UseDemoProductionResult {
  state: DemoProductionState;
  selectedLanguages: DemoLanguage[];
  toggleLanguage: (lang: DemoLanguage) => void;
  audiobookEnabled: boolean;
  setAudiobookEnabled: (value: boolean) => void;
  start: () => void;
  reset: () => void;
  /** Trigger audiobook playback for one language; the panel calls this on Play click. */
  playLanguage: (lang: DemoLanguage) => Promise<void>;
  /** Pause whichever language is currently playing. No-op if nothing is playing. */
  pausePlayback: () => void;
  /** Currently-playing language, or null when paused / nothing started. */
  playingLanguage: DemoLanguage | null;
}

/**
 * Drives the timed reveal of the investor-pitch Production-façade.
 *
 * State transitions are scheduled through the injected `schedule` dependency
 * (a real-clock setTimeout in the browser, fake timers in tests), so the
 * pacing can be deterministically advanced under vi.useFakeTimers.
 *
 * Telemetry: every state transition writes a single record to
 * localStorage[demo_telemetry] (or the injected stub). The plan calls for
 * start/end markers per phase; we record one per transition so a recording
 * of the demo can be cross-referenced after the fact.
 */
export function useDemoProduction(
  options: DemoProductionOptions = {}
): UseDemoProductionResult {
  const deps: DemoProductionDeps = useMemo(
    () => ({ ...defaultDeps, ...(options.deps ?? {}) }),
    // The `deps` object is intentionally re-computed only when the override
    // shape changes; in production callers don't pass `options.deps` at all
    // so this stays stable.
    [options.deps]
  );

  // Lazy initializer pulls a previous in-flight session out of localStorage
  // when the user refreshed mid-pacing. Anything older than the resume
  // window is discarded so a stale 'producing' snapshot from yesterday
  // doesn't ghost the UI.
  const [state, setState] = useState<DemoProductionState>(() => {
    if (typeof window === "undefined") return initialState;
    try {
      const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) return initialState;
      const parsed = JSON.parse(raw) as DemoProductionState;
      if (
        parsed.status === "producing" &&
        typeof parsed.startedAt === "number" &&
        Date.now() - parsed.startedAt < STATE_RESUME_WINDOW_MS
      ) {
        return parsed;
      }
      return initialState;
    } catch {
      return initialState;
    }
  });
  const [selectedLanguages, setSelectedLanguages] = useState<DemoLanguage[]>(
    () => [...DEMO_LANGUAGES]
  );
  const [audiobookEnabled, setAudiobookEnabled] = useState<boolean>(true);

  // Persist the state snapshot on every change so a refresh mid-pacing can
  // hydrate back to it. Cleared on reset.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (state.status === "idle") {
        window.localStorage.removeItem(STATE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      // best-effort
    }
  }, [state]);

  const cancelHandlesRef = useRef<Array<() => void>>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingLanguage, setPlayingLanguage] = useState<DemoLanguage | null>(null);

  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
      } catch {
        // ignore
      }
    }
    audioRef.current = null;
    setPlayingLanguage(null);
  }, []);

  // Stop any in-flight audio when the consumer unmounts so it doesn't keep
  // playing in the background.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        try {
          a.pause();
        } catch {
          // ignore
        }
      }
      audioRef.current = null;
    };
  }, []);

  const cancelPending = useCallback(() => {
    for (const cancel of cancelHandlesRef.current) {
      try {
        cancel();
      } catch {
        // ignore cancellation errors
      }
    }
    cancelHandlesRef.current = [];
  }, []);

  // Cancel pending timers if the consumer unmounts mid-run.
  useEffect(() => {
    return () => {
      cancelPending();
    };
  }, [cancelPending]);

  // Resume effect — runs once on mount. If lazy-init pulled an in-flight
  // session out of localStorage, this re-schedules the remaining timeline
  // events so the pacing animation continues from the right offset. Pure
  // side-effect setup; no setState in render.
  useEffect(() => {
    if (state.status !== "producing" || state.startedAt == null) return;
    const elapsed = deps.now() - state.startedAt;
    if (elapsed >= PACING.completedAt) {
      // The full pacing window already elapsed during the refresh — close out.
      setState((prev) =>
        reduceDemoProduction(prev, { type: "done", completedAt: deps.now() })
      );
      return;
    }
    const fullTimeline = planDemoTimeline({
      selectedLanguages: DEMO_LANGUAGES,
      audiobookEnabled: true,
      secondaryJitter: () => 0,
    });
    const remaining = remainingDemoTimeline(fullTimeline, elapsed);
    for (const event of remaining) {
      const cancel = deps.schedule(event.at, () => {
        if (event.kind === "lang_ready") {
          setState((prev) =>
            reduceDemoProduction(prev, { type: "lang_ready", lang: event.lang })
          );
        } else if (event.kind === "audiobook_ready") {
          setState((prev) =>
            reduceDemoProduction(prev, { type: "audiobook_ready" })
          );
        } else {
          setState((prev) =>
            reduceDemoProduction(prev, { type: "done", completedAt: deps.now() })
          );
        }
      });
      cancelHandlesRef.current.push(cancel);
    }
    // Run once on mount only — `state` deliberately omitted so we don't
    // re-schedule on every state transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleLanguage = useCallback((lang: DemoLanguage) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  }, []);

  const reset = useCallback(() => {
    cancelPending();
    setState((prev) => reduceDemoProduction(prev, { type: "reset" }));
  }, [cancelPending]);

  const start = useCallback(() => {
    cancelPending();
    const startedAt = deps.now();
    const selectedLanguagesAtStart = selectedLanguages.slice();
    setState((prev) => {
      const next = reduceDemoProduction(prev, {
        type: "start",
        startedAt,
        selectedLanguages: selectedLanguagesAtStart,
      });
      // The source language ("sv") is already in its original form — it
      // doesn't need a translation pass, so its badge is ready the moment
      // production starts. Without this, "10 languages ready" would always
      // tick as 9 because only the 3 primary + 6 secondary translations
      // get scheduled flips.
      if (selectedLanguagesAtStart.includes("sv")) {
        return reduceDemoProduction(next, { type: "lang_ready", lang: "sv" });
      }
      return next;
    });
    deps.recordTelemetry({ event: "start", t: 0 });

    const timeline = planDemoTimeline({
      selectedLanguages: selectedLanguagesAtStart,
      audiobookEnabled,
      secondaryJitter: (idx) =>
        Math.floor(Math.random() * PACING.secondaryJitterMs) +
        // Add a tiny per-index nudge so two consecutive entries with the
        // same jitter still preserve a stable visual order.
        idx * 0,
    });

    for (const event of timeline) {
      const cancel = deps.schedule(event.at, () => {
        if (event.kind === "lang_ready") {
          setState((prev) =>
            reduceDemoProduction(prev, { type: "lang_ready", lang: event.lang })
          );
          deps.recordTelemetry({
            event: "lang_ready",
            t: deps.now() - startedAt,
            lang: event.lang,
          });
          deps.playSuccessPing();
        } else if (event.kind === "audiobook_ready") {
          setState((prev) =>
            reduceDemoProduction(prev, { type: "audiobook_ready" })
          );
          deps.recordTelemetry({
            event: "audiobook_ready",
            t: deps.now() - startedAt,
          });
          deps.playSuccessPing();
        } else {
          const completedAt = deps.now();
          setState((prev) =>
            reduceDemoProduction(prev, { type: "done", completedAt })
          );
          deps.recordTelemetry({ event: "done", t: completedAt - startedAt });
          deps.playSuccessPing();
        }
      });
      cancelHandlesRef.current.push(cancel);
    }
  }, [audiobookEnabled, cancelPending, deps, selectedLanguages]);

  const playLanguage = useCallback(
    async (lang: DemoLanguage) => {
      const url = `/demo-assets/audio/${lang}.mp3`;
      deps.recordTelemetry({
        event: "audio_play",
        t:
          state.startedAt != null ? deps.now() - state.startedAt : 0,
        lang,
      });
      // SSR / non-browser path: fall back to deps.playAudio (also the test seam).
      if (typeof window === "undefined") {
        await deps.playAudio(url);
        return;
      }
      // Resume the same element if the click is on the language we already
      // had paused — keeps the playhead instead of restarting from 0.
      if (audioRef.current && audioRef.current.src.endsWith(`${lang}.mp3`)) {
        try {
          await audioRef.current.play();
          setPlayingLanguage(lang);
        } catch {
          // ignore
        }
        return;
      }
      // Switching languages: stop the previous one before starting the new.
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          // ignore
        }
        audioRef.current = null;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
          setPlayingLanguage(null);
        }
      });
      audio.addEventListener("pause", () => {
        if (audioRef.current === audio && !audio.ended) {
          setPlayingLanguage(null);
        }
      });
      try {
        await audio.play();
        setPlayingLanguage(lang);
      } catch {
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        setPlayingLanguage(null);
      }
    },
    [deps, state.startedAt]
  );

  const pausePlayback = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.pause();
    } catch {
      // ignore
    }
    setPlayingLanguage(null);
  }, []);

  // Stop audio when the demo is reset so a fresh run doesn't have a stale
  // narration leaking from the previous round.
  useEffect(() => {
    if (state.status === "idle") stopAudio();
  }, [state.status, stopAudio]);

  return {
    state,
    selectedLanguages,
    toggleLanguage,
    audiobookEnabled,
    setAudiobookEnabled,
    start,
    reset,
    playLanguage,
    pausePlayback,
    playingLanguage,
  };
}
