"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { resolveErrorMessage } from "@/lib/error-messages";
import type { Book } from "@/lib/marketing/types";
import type { TrailerGenre, TrailerTone } from "@/lib/ai/trailer-generation/schemas";
import {
  canAdvanceFromStep,
  createInitialWizardState,
  getMaxReachableStep,
  getNextStep,
  getPreviousStep,
  isStepReachable,
  wizardReducer,
  MAX_REGENERATE_ATTEMPTS,
  type WizardState,
  type WizardStep,
} from "@/components/marketing/wizard/wizard-machine";

type TrailerWizardContextValue = {
  state: WizardState;
  selectedBook: Book | null;
  canGoBack: boolean;
  canGoNext: boolean;
  maxReachableStep: WizardStep;
  isStepAllowed: (step: WizardStep) => boolean;
  goBack: () => void;
  goNext: () => void;
  goToStep: (step: WizardStep) => void;
  selectBook: (bookId: string) => void;
  setGenre: (genre: TrailerGenre) => void;
  setTone: (tone: TrailerTone) => void;
  setDescription: (description: string) => void;
  setKeywords: (keywords: string[]) => void;
  generateScenes: () => Promise<void>;
  regenerateScenes: () => Promise<void>;
  fetchQuota: () => Promise<void>;
  buildTrailer: () => Promise<void>;
  resetBuild: () => void;
};

type TrailerWizardProviderProps = {
  books: Book[];
  initialBookId?: string | null;
  children: ReactNode;
};

type GenerateResponse = {
  ok?: boolean;
  scenes?: Array<{ visual_prompt: string; duration: 5 }>;
  caption?: string;
  hashtags?: string[];
  title_card?: string;
  error?: string;
};

type BuildResponse = {
  assetId?: string;
  url?: string;
  error?: string;
};

type BillingStateResponse = {
  isProActive?: boolean;
  plan?: string;
  error?: string;
};

function extractErrorMessage(
  payload: { error?: string } | null | undefined,
  fallback: string
): string {
  return resolveErrorMessage(payload?.error, fallback);
}

const WIZARD_SESSION_KEY = "trailer-wizard-state";

type PersistedWizardState = Pick<
  WizardState,
  "step" | "selectedBookId" | "feeling" | "story" | "generate" | "build"
>;

function getPersistedState(): PersistedWizardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WIZARD_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("step" in parsed) ||
      !("feeling" in parsed)
    ) {
      return null;
    }
    return parsed as PersistedWizardState;
  } catch {
    return null;
  }
}

function persistState(state: WizardState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedWizardState = {
      step: state.step,
      selectedBookId: state.selectedBookId,
      feeling: state.feeling,
      story: state.story,
      generate: state.generate,
      build: state.build,
    };
    sessionStorage.setItem(WIZARD_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors.
  }
}

function mergePersistedIntoInitial(
  initial: WizardState,
  saved: PersistedWizardState
): WizardState {
  const validBookId = initial.books.some((b) => b.id === saved.selectedBookId)
    ? saved.selectedBookId
    : null;
  return {
    ...initial,
    step: saved.step,
    selectedBookId: validBookId ?? initial.selectedBookId,
    feeling: saved.feeling,
    story: saved.story,
    generate: saved.generate,
    build: saved.build,
  };
}

const FREE_TRAILER_LIMIT = 1;
const PRO_TRAILER_LIMIT = 5;

const WizardContext = createContext<TrailerWizardContextValue | null>(null);

export function TrailerWizardProvider({
  books,
  initialBookId = null,
  children,
}: TrailerWizardProviderProps) {
  const [state, dispatch] = useReducer(
    wizardReducer,
    { books, initialBookId },
    (arg) => {
      const initial = createInitialWizardState(arg);
      const saved = getPersistedState();
      if (!saved || arg.books.length === 0) return initial;
      return mergePersistedIntoInitial(initial, saved);
    }
  );

  useEffect(() => {
    dispatch({ type: "SYNC_BOOKS", books, initialBookId });
  }, [books, initialBookId]);

  useEffect(() => {
    persistState(state);
  }, [state]);

  const selectedBook = useMemo(
    () => state.books.find((book) => book.id === state.selectedBookId) ?? null,
    [state.books, state.selectedBookId]
  );

  const runGenerateScenes = useCallback(async () => {
    const book = state.books.find((b) => b.id === state.selectedBookId);
    if (!book || !state.feeling.genre || !state.feeling.tone) {
      dispatch({ type: "GENERATE_FAILURE", errorMessage: "Välj bok, genre och ton först." });
      return;
    }
    if (state.generate.regenerateCount >= MAX_REGENERATE_ATTEMPTS) {
      dispatch({ type: "GENERATE_FAILURE", errorMessage: "Max antal omgenereringar uppnått." });
      return;
    }
    dispatch({ type: "GENERATE_REQUEST" });
    try {
      const url = "/api/books/" + state.selectedBookId + "/trailer/generate";
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: book.title?.trim() || "Untitled",
          genre: state.feeling.genre,
          description: state.story.description.trim(),
          keywords: state.story.keywords,
          tone: state.feeling.tone,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as GenerateResponse;
      if (!response.ok || !payload.scenes) {
        dispatch({
          type: "GENERATE_FAILURE",
          errorMessage: extractErrorMessage(payload, "Kunde inte generera scener."),
        });
        return;
      }
      dispatch({
        type: "GENERATE_SUCCESS",
        scenes: payload.scenes,
        caption: payload.caption ?? "",
        hashtags: payload.hashtags ?? [],
        titleCard: payload.title_card ?? "",
      });
    } catch {
      dispatch({ type: "GENERATE_FAILURE", errorMessage: "Nätverksfel vid generering av scener." });
    }
  }, [
    state.books,
    state.selectedBookId,
    state.feeling.genre,
    state.feeling.tone,
    state.story.description,
    state.story.keywords,
    state.generate.regenerateCount,
  ]);

  const generateScenes = useCallback(() => runGenerateScenes(), [runGenerateScenes]);
  const regenerateScenes = useCallback(() => runGenerateScenes(), [runGenerateScenes]);

  const fetchQuota = useCallback(async () => {
    try {
      const response = await fetch("/api/billing/state", {
        method: "GET",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as BillingStateResponse;
      if (!response.ok) {
        dispatch({
          type: "BUILD_QUOTA_FETCHED",
          isProUser: false,
          quotaUsed: 0,
          quotaLimit: FREE_TRAILER_LIMIT,
        });
        return;
      }
      const isProUser = payload.isProActive === true;
      dispatch({
        type: "BUILD_QUOTA_FETCHED",
        isProUser,
        quotaUsed: state.generate.regenerateCount,
        quotaLimit: isProUser ? PRO_TRAILER_LIMIT : FREE_TRAILER_LIMIT,
      });
    } catch {
      dispatch({
        type: "BUILD_QUOTA_FETCHED",
        isProUser: false,
        quotaUsed: 0,
        quotaLimit: FREE_TRAILER_LIMIT,
      });
    }
  }, [state.generate.regenerateCount]);

  const buildTrailer = useCallback(async () => {
    const book = state.books.find((b) => b.id === state.selectedBookId);
    if (!book) {
      dispatch({ type: "BUILD_FAILURE", errorMessage: "Välj en bok först." });
      return;
    }
    if (!state.feeling.genre || !state.feeling.tone) {
      dispatch({ type: "BUILD_FAILURE", errorMessage: "Genre och ton måste vara valda." });
      return;
    }
    dispatch({ type: "BUILD_START" });
    try {
      const url = "/api/books/" + state.selectedBookId + "/trailer/build";
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: book.title?.trim() || "Untitled",
          genre: state.feeling.genre,
          description: state.story.description.trim(),
          keywords: state.story.keywords,
          tone: state.feeling.tone,
        }),
        signal: AbortSignal.timeout(600_000),
      });
      const payload = (await response.json().catch(() => ({}))) as BuildResponse;
      if (!response.ok || !payload.assetId || !payload.url) {
        dispatch({
          type: "BUILD_FAILURE",
          errorMessage: extractErrorMessage(payload, "Kunde inte bygga trailern."),
        });
        return;
      }
      dispatch({
        type: "BUILD_SUCCESS",
        assetId: payload.assetId,
        videoUrl: payload.url,
        caption: state.generate.caption,
      });
    } catch {
      dispatch({ type: "BUILD_FAILURE", errorMessage: "Nätverksfel vid trailerbygge." });
    }
  }, [
    state.books,
    state.selectedBookId,
    state.feeling.genre,
    state.feeling.tone,
    state.story.description,
    state.story.keywords,
    state.generate.caption,
  ]);

  const value = useMemo<TrailerWizardContextValue>(() => {
    const maxReachableStep = getMaxReachableStep(state);
    return {
      state,
      selectedBook,
      canGoBack: Boolean(getPreviousStep(state.step)),
      canGoNext: Boolean(getNextStep(state.step)) && canAdvanceFromStep(state, state.step),
      maxReachableStep,
      isStepAllowed: (step) => isStepReachable(state, step),
      goBack: () => dispatch({ type: "PREVIOUS_STEP" }),
      goNext: () => dispatch({ type: "NEXT_STEP" }),
      goToStep: (step) => dispatch({ type: "GO_TO_STEP", step }),
      selectBook: (bookId) => dispatch({ type: "SELECT_BOOK", bookId }),
      setGenre: (genre) => dispatch({ type: "SET_GENRE", genre }),
      setTone: (tone) => dispatch({ type: "SET_TONE", tone }),
      setDescription: (description) => dispatch({ type: "SET_DESCRIPTION", description }),
      setKeywords: (keywords) => dispatch({ type: "SET_KEYWORDS", keywords }),
      generateScenes,
      regenerateScenes,
      fetchQuota,
      buildTrailer,
      resetBuild: () => dispatch({ type: "RESET_BUILD" }),
    };
  }, [buildTrailer, fetchQuota, generateScenes, regenerateScenes, selectedBook, state]);

  return (
    <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
  );
}

export function useTrailerWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useTrailerWizard must be used within TrailerWizardProvider");
  }
  return context;
}
