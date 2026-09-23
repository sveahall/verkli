/**
 * Pure planning + state-machine helpers for the investor-pitch
 * ProductionFacade. Split out from the hook so the test suite can exercise
 * them in a plain node-env without dragging in React or browser globals.
 */

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
 * Pacing schedule. Each entry is (delayMs, language). Investor-pitch tuned —
 * tighter than the original plan because Day-N live-QA showed the post-
 * audiobook gap was bleeding tension out of the room.
 *
 *   0–3s    primary trio (en/de/fr) light up at 0/1500/3000 ms
 *   3–6s    audiobook waveform pulses, then the Play button appears at 6 s
 *   6–13s   secondary six tick in at ~1 s intervals starting 7 s
 *   13–14s  "all ready" plus final checkmark pop
 *
 * Hard rule: no step ≥ 2 s without a visible change. The widest gap is
 * 3000 → 6000 (audiobook waveform pulse-up — the visible change) and
 * 6000 → 7000 (audiobook ready check + first secondary).
 */
export const PACING = {
  primaryStarts: [0, 1500, 3000] as const,
  audiobookReadyAt: 6000,
  secondaryBaseStarts: [7000, 8000, 9000, 10000, 11000, 12000] as const,
  secondaryJitterMs: 400,
  completedAt: 13500,
} as const;

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

/**
 * Pure helper: given the planned full timeline and the elapsed time since
 * the start event, return only the events that haven't fired yet, with
 * their `at` rebased to `at - elapsedMs` so the caller can hand them to
 * setTimeout directly.
 */
export function remainingDemoTimeline(
  fullTimeline: ReadonlyArray<DemoTimelineEvent>,
  elapsedMs: number
): DemoTimelineEvent[] {
  return fullTimeline
    .filter((event) => event.at > elapsedMs)
    .map((event) => ({ ...event, at: event.at - elapsedMs }));
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

export type DemoProductionAction =
  | { type: "start"; startedAt: number; selectedLanguages: ReadonlyArray<DemoLanguage> }
  | { type: "lang_ready"; lang: DemoLanguage }
  | { type: "audiobook_ready" }
  | { type: "done"; completedAt: number }
  | { type: "reset" };

export function emptyBadges(): Record<DemoLanguage, boolean> {
  return DEMO_LANGUAGES.reduce<Record<DemoLanguage, boolean>>(
    (acc, lang) => {
      acc[lang] = false;
      return acc;
    },
    {} as Record<DemoLanguage, boolean>
  );
}

export const initialDemoProductionState: DemoProductionState = {
  status: "idle",
  badges: emptyBadges(),
  audiobookReady: false,
  startedAt: null,
  completedAt: null,
};

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
      return initialDemoProductionState;
    default:
      return state;
  }
}
