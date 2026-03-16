import type { Book } from "@/lib/marketing/types";
import type {
  TrailerGenre,
  TrailerTone,
  TrailerScene,
} from "@/lib/ai/trailer-generation/schemas";

// Re-export for convenience
export type { TrailerGenre, TrailerTone, TrailerScene };

// ─── Steps (3-step flow) ────────────────────────────────────────────────────

export type WizardStep = "selectBook" | "configure" | "result";

export const WIZARD_STEP_ORDER: readonly WizardStep[] = [
  "selectBook",
  "configure",
  "result",
] as const;

export const WIZARD_STEP_META: Record<
  WizardStep,
  { title: string; description: string }
> = {
  selectBook: {
    title: "Välj bok",
    description: "Välj boken du vill skapa en trailer för.",
  },
  configure: {
    title: "Anpassa",
    description: "Granska och justera inställningar.",
  },
  result: {
    title: "Skapa",
    description: "Generera scener och bygg din trailer.",
  },
};

// ─── Genre + Tone constants ───────────────────────────────────────────────

export const GENRE_OPTIONS: { value: TrailerGenre; label: string }[] = [
  { value: "biography", label: "Biografi" },
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
  biography: ["intense", "epic", "dreamy", "melancholic"],
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

// ─── Auto-detection ─────────────────────────────────────────────────────────

const GENRE_KEYWORDS: Record<TrailerGenre, string[]> = {
  biography: [
    "biografi", "memoar", "sann historia", "livshistoria", "uppväxt",
    "karriär", "generation", "grundare", "entreprenör", "vd",
    "hans liv", "hennes liv", "berättelsen om", "mannen bakom",
    "kvinnan bakom", "true story", "biography", "memoir", "life story",
    "founder", "entrepreneur", "ceo", "his life", "her life",
  ],
  romance: [
    "kärlek", "hjärta", "passion", "romans", "förälsk", "kyss",
    "romantik", "älska", "längtan", "begär",
    "love", "heart", "romance", "kiss", "desire", "longing",
  ],
  fantasy: [
    "magi", "drake", "trolldom", "svärd", "kungarike", "älv",
    "demon", "profetia", "mystisk", "förtrollad", "rike",
    "magic", "dragon", "sword", "kingdom", "elf", "sorcery", "quest",
  ],
  thriller: [
    "mord", "spänning", "kriminal", "brotts", "polis", "mysterium",
    "hot", "jakt", "misstänkt", "mörker", "fara", "detektiv",
    "murder", "crime", "police", "mystery", "detective", "danger",
  ],
  ya: [
    "tonåring", "skola", "ungdom", "kompisar", "identitet",
    "mobbning", "uppväxt", "gymnasium",
    "teenager", "school", "youth", "growing up", "high school",
  ],
  literary: [], // fallback — no specific keywords
};

const DEFAULT_GENRE_TONES: Record<TrailerGenre, TrailerTone> = {
  romance: "passionate",
  fantasy: "epic",
  thriller: "suspenseful",
  ya: "whimsical",
  literary: "dreamy",
  biography: "intense",
};

const STOP_WORDS = new Set([
  "och", "att", "det", "en", "ett", "är", "var", "som", "med", "för",
  "den", "har", "inte", "till", "på", "av", "om", "kan", "han", "hon",
  "dem", "sin", "sitt", "sina", "från", "men", "alla", "denna", "de",
  "hade", "ska", "skulle", "mer", "eller", "där", "här", "när", "hur",
  "vad", "bara", "efter", "över", "under", "mot", "genom", "utan", "vid",
  "så", "sig", "dig", "mig", "oss", "era", "deras", "vara", "bli",
  "the", "and", "is", "in", "it", "to", "of", "for", "on", "with",
  "at", "by", "an", "be", "this", "that", "from", "but", "not", "are",
  "was", "were", "been", "has", "had", "have", "will", "would", "can",
  "could", "should", "may", "might", "shall", "or", "if", "so", "no",
  "up", "out", "do", "did", "my", "your", "his", "her", "its", "our",
  "their", "me", "him", "us", "them", "about", "into",
]);

export function detectGenreFromText(text: string): TrailerGenre {
  const lower = text.toLowerCase();
  let bestGenre: TrailerGenre = "literary";
  let bestScore = 0;

  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (genre === "literary") continue;
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestGenre = genre as TrailerGenre;
    }
  }

  return bestGenre;
}

export function extractKeywordsFromText(
  text: string,
  maxKeywords = 5
): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const sorted = [...freq.entries()].sort(
    (a, b) => b[1] * b[0].length - a[1] * a[0].length
  );

  return sorted.slice(0, maxKeywords).map(([word]) => word);
}

export type AutoConfigResult = {
  genre: TrailerGenre;
  tone: TrailerTone;
  description: string;
  keywords: string[];
};

export function autoConfigureForBook(book: {
  title: string | null;
  description: string | null;
  chapter_excerpt: string | null;
}): AutoConfigResult {
  // Use all available text for genre detection (title + description + chapter content)
  const allText = [
    book.title ?? "",
    book.description ?? "",
    book.chapter_excerpt ?? "",
  ]
    .join(" ")
    .trim();

  // For the API description field: prefer book description, fall back to chapter excerpt, then title
  const description =
    book.description?.trim() ||
    book.chapter_excerpt?.trim() ||
    book.title?.trim() ||
    "Trailer för en bok";

  const genre = detectGenreFromText(allText);
  const tone = DEFAULT_GENRE_TONES[genre];
  const keywords = extractKeywordsFromText(allText);

  if (keywords.length === 0 && book.title) {
    const titleWord = book.title.trim().split(/\s+/)[0];
    if (titleWord) keywords.push(titleWord.toLowerCase());
  }

  return { genre, tone, description, keywords };
}

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

export type PersistedWizardState = Pick<
  WizardState,
  "step" | "selectedBookId" | "feeling" | "story" | "generate" | "build"
>;

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
  const selectedBookId = resolveSelectedBookId(
    input.books,
    input.initialBookId
  );
  const selectedBook =
    input.books.find((b) => b.id === selectedBookId) ?? null;

  // Auto-configure if we have a selected book
  const config = selectedBook ? autoConfigureForBook(selectedBook) : null;

  // Skip to configure if book is pre-selected (from bookId param or single book)
  const skipToConfig = Boolean(
    selectedBookId && (input.initialBookId || input.books.length === 1)
  );

  return {
    step: skipToConfig ? "configure" : "selectBook",
    books: input.books,
    selectedBookId,
    feeling: config
      ? { genre: config.genre, tone: config.tone }
      : { genre: null, tone: null },
    story: config
      ? { description: config.description, keywords: config.keywords }
      : { description: "", keywords: [] },
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
    case "configure":
      return (
        Boolean(state.feeling.genre) &&
        Boolean(state.feeling.tone) &&
        state.story.description.trim().length >= 1 &&
        state.story.keywords.length >= 1
      );
    case "result":
      return false; // terminal
    default:
      return false;
  }
}

export function getMaxReachableStep(state: WizardState): WizardStep {
  for (const step of WIZARD_STEP_ORDER) {
    if (!canAdvanceFromStep(state, step)) return step;
  }
  return "result";
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
  | { type: "HYDRATE_PERSISTED"; persisted: PersistedWizardState }
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

    case "HYDRATE_PERSISTED": {
      if (state.books.length === 0) return state;
      const bookId = resolveSelectedBookId(
        state.books,
        action.persisted.selectedBookId
      );
      const book = state.books.find((b) => b.id === bookId) ?? null;

      // Re-fill missing auto-config fields from book data (handles stale sessions)
      let feeling = action.persisted.feeling;
      let story = action.persisted.story;
      if (book) {
        const needsGenre = !feeling.genre;
        const needsDescription = !story.description || story.description.trim().length === 0;
        const needsKeywords = !story.keywords || story.keywords.length === 0;
        if (needsGenre || needsDescription || needsKeywords) {
          const config = autoConfigureForBook(book);
          if (needsGenre) {
            feeling = { genre: config.genre, tone: config.tone };
          }
          if (needsDescription) {
            story = { ...story, description: config.description };
          }
          if (needsKeywords) {
            story = { ...story, keywords: config.keywords };
          }
        }
      }

      const hydrated: WizardState = {
        ...state,
        step: action.persisted.step,
        selectedBookId: bookId,
        feeling,
        story,
        generate: action.persisted.generate,
        build: action.persisted.build,
      };
      if (!isStepReachable(hydrated, hydrated.step)) {
        return { ...hydrated, step: getMaxReachableStep(hydrated) };
      }
      return hydrated;
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
      const book = state.books.find((b) => b.id === bookId);
      const config = book ? autoConfigureForBook(book) : null;
      return {
        ...state,
        selectedBookId: bookId,
        feeling: config
          ? { genre: config.genre, tone: config.tone }
          : { genre: null, tone: null },
        story: config
          ? { description: config.description, keywords: config.keywords }
          : { description: "", keywords: [] },
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };
    }

    case "SET_GENRE": {
      const newTones = GENRE_TONE_MAP[action.genre];
      const toneStillValid =
        state.feeling.tone && newTones.includes(state.feeling.tone);
      return {
        ...state,
        feeling: {
          genre: action.genre,
          tone: toneStillValid
            ? state.feeling.tone
            : DEFAULT_GENRE_TONES[action.genre],
        },
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
        step: "configure",
        generate: createInitialGenerate(),
        build: createInitialBuild(),
      };

    default:
      return state;
  }
}
