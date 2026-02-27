import type { Book } from "@/lib/marketing/types";
import type {
  TrailerGenre,
  TrailerTone,
  TrailerScene,
} from "@/lib/ai/trailer-generation/schemas";

// Re-export for convenience
export type { TrailerGenre, TrailerTone, TrailerScene };

// ─── Steps ─────────────────────────────────────────────────────────────────

export type WizardStep =
  | "selectBook"
  | "feeling"
  | "story"
  | "previewScenes"
  | "buildTrailer";

export const WIZARD_STEP_ORDER: readonly WizardStep[] = [
  "selectBook",
  "feeling",
  "story",
  "previewScenes",
  "buildTrailer",
] as const;

export const WIZARD_STEP_META: Record<
  WizardStep,
  { title: string; description: string }
> = {
  selectBook: { title: "Välj bok", description: "Välj boken du vill skapa en trailer för." },
  feeling: { title: "Känsla", description: "Välj genre och ton." },
  story: { title: "Historia", description: "Beskriv handlingen och nyckelord." },
  previewScenes: { title: "Förhandsgranska", description: "Granska genererade scener." },
  buildTrailer: { title: "Skapa trailer", description: "Bygg din färdiga boktrailer." },
};

// ─── Genre + Tone constants ───────────────────────────────────────────────

export const GENRE_OPTIONS: { value: TrailerGenre; label: string }[] = [
  { value: "romance", label: "Romans" },
  { value: "fantasy", label: "Fantasy" },
  { value: "thriller", label: "Thriller" },
  { value: "ya", label: "Young Adult" },
  { value: "literary", label: "Skönlitteratur" },
];

export const GENRE_TONE_MAP: Record<TrailerGenre, TrailerTone[]> = {
  romance: ["dreamy", "passionate", "melancholic", "whimsical"],
  fantasy: ["epic", "dark", "whimsical", "dreamy"],
  thriller: ["dark", "intense", "suspenseful", "melancholic"],
  ya: ["whimsical", "intense", "dreamy", "passionate"],
  literary: ["melancholic", "dreamy", "dark", "intense"],
};

export const TONE_LABELS: Record<TrailerTone, string> = {
  dark: "Mörk",
  dreamy: "Drömsk",
  intense: "Intensiv",
  whimsical: "Nyckfull",
  melancholic: "Melankolisk",
  suspenseful: "Spännande",
  passionate: "Passionerad",
  epic: "Episk",
};

export const TONE_MOOD_FILTERS: Record<TrailerTone, string> = {
  dark: "brightness(0.6) contrast(1.2) saturate(0.7)",
  dreamy: "brightness(1.1) contrast(0.9) saturate(1.3) hue-rotate(10deg)",
  intense: "brightness(0.9) contrast(1.4) saturate(1.2)",
  whimsical: "brightness(1.15) contrast(0.95) saturate(1.4) hue-rotate(-10deg)",
  melancholic: "brightness(0.85) contrast(1.1) saturate(0.5) sepia(0.3)",
  suspenseful: "brightness(0.7) contrast(1.3) saturate(0.8)",
  passionate: "brightness(1.0) contrast(1.2) saturate(1.5) hue-rotate(-5deg)",
  epic: "brightness(1.05) contrast(1.3) saturate(1.1)",
};

// ─── Constants ────────────────────────────────────────────────────────────

export const MAX_REGENERATE_ATTEMPTS = 3;

// ─── Generate state ───────────────────────────────────────────────────────

export type GenerateStatus = "idle" | "loading" | "ready" | "error";

export type WizardGenerateState = {
  status: GenerateStatus;
  scenes: TrailerScene[];
  caption: string;
  hashtags: string[];
  titleCard: string;
  errorMessage: string | null;
  regenerateCount: number;
};

// ─── Build state ──────────────────────────────────────────────────────────

export type BuildStatus =
  | "idle"
  | "fetching_quota"
  | "confirming"
  | "building"
  | "completed"
  | "error";

export type WizardBuildState = {
  status: BuildStatus;
  assetId: string | null;
  videoUrl: string | null;
  caption: string | null;
  errorMessage: string | null;
  isProUser: boolean;
  quotaUsed: number;
  quotaLimit: number;
};

// ─── Wizard state ─────────────────────────────────────────────────────────

export type WizardState = {
  step: WizardStep;
  books: Book[];
  selectedBookId: string | null;
  feeling: { genre: TrailerGenre | null; tone: TrailerTone | null };
  story: { description: string; keywords: string[] };
  generate: WizardGenerateState;
  build: WizardBuildState;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function resolveSelectedBookId(
  books: Book[],
  preferredBookId: string | null | undefined
): string | null {
  if (preferredBookId && books.some((b) => b.id === preferredBookId)) {
    return preferredBookId;
  }
  return books[0]?.id ?? null;
}

function createInitialGenerate(): WizardGenerateState {
  return {
    status: "idle",
    scenes: [],
    caption: "",
    hashtags: [],
    titleCard: "",
    errorMessage: null,
    regenerateCount: 0,
  };
}

function createInitialBuild(): WizardBuildState {
  return {
    status: "idle",
    assetId: null,
    videoUrl: null,
    caption: null,
    errorMessage: null,
    isProUser: false,
    quotaUsed: 0,
    quotaLimit: 1,
  };
}

export function createInitialWizardState(input: {
  books: Book[];
  initialBookId?: string | null;
}): WizardState {
  return {
    step: "selectBook",
    books: input.books,
    selectedBookId: resolveSelectedBookId(input.books, input.initialBookId),
    feeling: { genre: null, tone: null },
    story: { description: "", keywords: [] },
    generate: createInitialGenerate(),
    build: createInitialBuild(),
  };
}

// ─── Navigation helpers ─────────────────────────────────────────────────

export function getNextStep(step: WizardStep): WizardStep | null {
  const idx = WIZARD_STEP_ORDER.indexOf(step);
  return WIZARD_STEP_ORDER[idx + 1] ?? null;
}

export function getPreviousStep(step: WizardStep): WizardStep | null {
  const idx = WIZARD_STEP_ORDER.indexOf(step);
  return idx > 0 ? WIZARD_STEP_ORDER[idx - 1] : null;
}

export function canAdvanceFromStep(
  state: WizardState,
  step: WizardStep
): boolean {
  switch (step) {
    case "selectBook":
      return Boolean(state.selectedBookId);
    case "feeling":
      return Boolean(state.feeling.genre) && Boolean(state.feeling.tone);
    case "story":
      return state.story.description.trim().length >= 20 && state.story.keywords.length >= 1;
    case "previewScenes":
      return state.generate.status === "ready" && state.generate.scenes.length >= 1;
    case "buildTrailer":
      return false; // terminal
    default:
      return false;
  }
}

export function getMaxReachableStep(state: WizardState): WizardStep {
  for (const step of WIZARD_STEP_ORDER) {
    if (!canAdvanceFromStep(state, step)) return step;
  }
  return "buildTrailer";
}

export function isStepReachable(
  state: WizardState,
  step: WizardStep
): boolean {
  const max = getMaxReachableStep(state);
  return (
    WIZARD_STEP_ORDER.indexOf(step) <= WIZARD_STEP_ORDER.indexOf(max)
  );
}

// ─── Actions ────────────────────────────────────────────────────────────

type WizardAction =
  | { type: "SYNC_BOOKS"; books: Book[]; initialBookId?: string | null }
  | { type: "GO_TO_STEP"; step: WizardStep }
  | { type: "NEXT_STEP" }
  | { type: "PREVIOUS_STEP" }
  | { type: "SELECT_BOOK"; bookId: string }
  | { type: "SET_GENRE"; genre: TrailerGenre }
  | { type: "SET_TONE"; tone: TrailerTone }
  | { type: "SET_DESCRIPTION"; description: string }
  | { type: "SET_KEYWORDS"; keywords: string[] }
  | { type: "GENERATE_REQUEST" }
  | {
      type: "GENERATE_SUCCESS";
      scenes: TrailerScene[];
      caption: string;
      hashtags: string[];
      titleCard: string;
    }
  | { type: "GENERATE_FAILURE"; errorMessage: string }
  | {
      type: "BUILD_QUOTA_FETCHED";
      isProUser: boolean;
      quotaUsed: number;
      quotaLimit: number;
    }
  | { type: "BUILD_START" }
  | { type: "BUILD_SUCCESS"; assetId: string; videoUrl: string; caption: string }
  | { type: "BUILD_FAILURE"; errorMessage: string }
  | { type: "RESET_BUILD" };

export type { WizardAction };

// ─── Reducer ────────────────────────────────────────────────────────────

export function wizardReducer(
  state: WizardState,
  action: WizardAction
): WizardState {
  switch (action.type) {
    case "SYNC_BOOKS": {
      const nextId = resolveSelectedBookId(
        action.books,
        state.selectedBookId ?? action.initialBookId
      );
      if (action.books.length === 0) {
        return {
          ...state,
          books: [],
          selectedBookId: null,
          step: "selectBook",
          generate: createInitialGenerate(),
          build: createInitialBuild(),
        };
      }
      if (nextId === state.selectedBookId) {
        return { ...state, books: action.books };
      }
      return {
        ...state,
        books: action.books,
        selectedBookId: nextId,
        step: "selectBook",
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };
    }

    case "GO_TO_STEP":
      if (!isStepReachable(state, action.step)) return state;
      return { ...state, step: action.step };

    case "NEXT_STEP": {
      if (!canAdvanceFromStep(state, state.step)) return state;
      const next = getNextStep(state.step);
      return next ? { ...state, step: next } : state;
    }

    case "PREVIOUS_STEP": {
      const prev = getPreviousStep(state.step);
      return prev ? { ...state, step: prev } : state;
    }

    case "SELECT_BOOK": {
      const bookId = resolveSelectedBookId(state.books, action.bookId);
      if (bookId === state.selectedBookId) return state;
      return {
        ...state,
        selectedBookId: bookId,
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };
    }

    case "SET_GENRE": {
      const newTones = GENRE_TONE_MAP[action.genre];
      const toneStillValid = state.feeling.tone && newTones.includes(state.feeling.tone);
      return {
        ...state,
        feeling: { genre: action.genre, tone: toneStillValid ? state.feeling.tone : null },
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };
    }

    case "SET_TONE":
      return {
        ...state,
        feeling: { ...state.feeling, tone: action.tone },
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };

    case "SET_DESCRIPTION":
      return {
        ...state,
        story: { ...state.story, description: action.description },
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };

    case "SET_KEYWORDS":
      return {
        ...state,
        story: { ...state.story, keywords: action.keywords },
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };

    case "GENERATE_REQUEST":
      return {
        ...state,
        generate: {
          ...state.generate,
          status: "loading",
          errorMessage: null,
          regenerateCount: state.generate.regenerateCount + 1,
        },
        build: createInitialBuild(),
      };

    case "GENERATE_SUCCESS":
      return {
        ...state,
        generate: {
          ...state.generate,
          status: "ready",
          scenes: action.scenes,
          caption: action.caption,
          hashtags: action.hashtags,
          titleCard: action.titleCard,
          errorMessage: null,
        },
      };

    case "GENERATE_FAILURE":
      return {
        ...state,
        generate: {
          ...state.generate,
          status: "error",
          errorMessage: action.errorMessage,
        },
      };

    case "BUILD_QUOTA_FETCHED":
      return {
        ...state,
        build: {
          ...state.build,
          status: "confirming",
          isProUser: action.isProUser,
          quotaUsed: action.quotaUsed,
          quotaLimit: action.quotaLimit,
        },
      };

    case "BUILD_START":
      return {
        ...state,
        build: {
          ...state.build,
          status: "building",
          errorMessage: null,
        },
      };

    case "BUILD_SUCCESS":
      return {
        ...state,
        build: {
          ...state.build,
          status: "completed",
          assetId: action.assetId,
          videoUrl: action.videoUrl,
          caption: action.caption,
          errorMessage: null,
        },
      };

    case "BUILD_FAILURE":
      return {
        ...state,
        build: {
          ...state.build,
          status: "error",
          errorMessage: action.errorMessage,
        },
      };

    case "RESET_BUILD":
      return {
        ...state,
        step: "feeling",
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };

    default:
      return state;
  }
}
