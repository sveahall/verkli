/**
 * Browser-side default deps for {@link useDemoProduction}. Kept in a
 * separate file so the pure planner module can stay node-friendly and
 * tests don't have to stub out localStorage / Web Audio just to import
 * timeline helpers.
 */

import type { DemoLanguage } from "./useDemoProduction.plan";

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

export const defaultDemoProductionDeps: DemoProductionDeps = {
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
