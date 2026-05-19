"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEMO_LANGUAGES,
  PACING,
  initialDemoProductionState,
  planDemoTimeline,
  reduceDemoProduction,
  remainingDemoTimeline,
  type DemoLanguage,
  type DemoProductionState,
} from "./useDemoProduction.plan";
import {
  STATE_RESUME_WINDOW_MS,
  STATE_STORAGE_KEY,
  defaultDemoProductionDeps,
  type DemoProductionDeps,
} from "./useDemoProduction.deps";

// Re-exports for callers (façade panel, tests) that historically imported
// from this file. Keeps the public API stable while the implementation is
// split across `.plan.ts` (pure helpers) and `.deps.ts` (browser defaults).
export {
  DEMO_LANGUAGES,
  PACING,
  planDemoTimeline,
  reduceDemoProduction,
  remainingDemoTimeline,
} from "./useDemoProduction.plan";
export type {
  DemoLanguage,
  DemoProductionState,
  DemoProductionStatus,
  DemoProductionAction,
  DemoTimelineEvent,
  PlanDemoTimelineArgs,
} from "./useDemoProduction.plan";
export type {
  DemoProductionDeps,
  DemoProductionTelemetryEvent,
} from "./useDemoProduction.deps";

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
    () => ({ ...defaultDemoProductionDeps, ...(options.deps ?? {}) }),
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
    if (typeof window === "undefined") return initialDemoProductionState;
    try {
      const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) return initialDemoProductionState;
      const parsed = JSON.parse(raw) as DemoProductionState;
      if (
        parsed.status === "producing" &&
        typeof parsed.startedAt === "number" &&
        Date.now() - parsed.startedAt < STATE_RESUME_WINDOW_MS
      ) {
        return parsed;
      }
      return initialDemoProductionState;
    } catch {
      return initialDemoProductionState;
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
  // Resume-effect guard. The lazy initializer above already discarded any
  // pre-existing session older than STATE_RESUME_WINDOW_MS, so when this is
  // false on mount and state.status === "producing" we know the session is
  // mid-pacing and should be resumed. Flipped to true after the first run so
  // subsequent re-renders (or HMR) don't schedule duplicate timers.
  const hasResumedRef = useRef(false);

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

  // Resume effect — re-schedules in-flight timeline events when a page
  // refresh dropped us back into the hook with state.status === "producing".
  // The hasResumedRef guard keeps it idempotent: even though deps may change
  // identity (in tests that swap deps), we only resume once per mount.
  useEffect(() => {
    if (hasResumedRef.current) return;
    if (state.status !== "producing" || state.startedAt == null) return;
    hasResumedRef.current = true;
    const elapsed = deps.now() - state.startedAt;
    if (elapsed >= PACING.completedAt) {
      // The full pacing window already elapsed during the refresh — close
      // out async so the state transition happens after this effect
      // finishes, not synchronously inside it.
      const cancel = deps.schedule(0, () => {
        setState((prev) =>
          reduceDemoProduction(prev, { type: "done", completedAt: deps.now() })
        );
      });
      cancelHandlesRef.current.push(cancel);
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
  }, [deps, state.status, state.startedAt]);

  const toggleLanguage = useCallback((lang: DemoLanguage) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  }, []);

  const reset = useCallback(() => {
    cancelPending();
    stopAudio();
    setState((prev) => reduceDemoProduction(prev, { type: "reset" }));
  }, [cancelPending, stopAudio]);

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
      secondaryJitter: () => Math.floor(Math.random() * PACING.secondaryJitterMs),
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
        t: state.startedAt != null ? deps.now() - state.startedAt : 0,
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
