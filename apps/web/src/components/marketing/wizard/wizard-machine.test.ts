import { describe, expect, it } from "vitest";
import {
  canAdvanceFromStep,
  createInitialWizardState,
  getMaxReachableStep,
  wizardReducer,
} from "@/components/marketing/wizard/wizard-machine";

const BOOKS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Book One",
    cover_image: "https://example.com/cover.jpg",
    description: "Desc",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Book Two",
    cover_image: null,
    description: null,
  },
];

describe("wizard-machine", () => {
  it("starts in selectBook with first book selected", () => {
    const state = createInitialWizardState({ books: BOOKS });

    expect(state.step).toBe("selectBook");
    expect(state.selectedBookId).toBe(BOOKS[0].id);
    expect(state.generate.status).toBe("idle");
    expect(state.build.status).toBe("idle");
  });

  it("enforces progression gates per step", () => {
    let state = createInitialWizardState({ books: BOOKS });
    expect(canAdvanceFromStep(state, "selectBook")).toBe(true);

    state = wizardReducer(state, { type: "NEXT_STEP" });
    expect(state.step).toBe("feeling");
    expect(canAdvanceFromStep(state, "feeling")).toBe(false);

    state = wizardReducer(state, { type: "SET_GENRE", genre: "fantasy" });
    expect(canAdvanceFromStep(state, "feeling")).toBe(false);

    state = wizardReducer(state, { type: "SET_TONE", tone: "epic" });
    expect(canAdvanceFromStep(state, "feeling")).toBe(true);

    state = wizardReducer(state, { type: "NEXT_STEP" });
    expect(state.step).toBe("story");
    expect(canAdvanceFromStep(state, "story")).toBe(false);

    state = wizardReducer(state, {
      type: "SET_DESCRIPTION",
      description: "En dramatisk resa genom svek, hopp och forsoning.",
    });
    expect(canAdvanceFromStep(state, "story")).toBe(false);

    state = wizardReducer(state, { type: "SET_KEYWORDS", keywords: ["drama"] });
    expect(canAdvanceFromStep(state, "story")).toBe(true);
    expect(getMaxReachableStep(state)).toBe("previewScenes");
  });

  it("resets tone when switching genre to an incompatible tone set", () => {
    let state = createInitialWizardState({ books: BOOKS });

    state = wizardReducer(state, { type: "SET_GENRE", genre: "fantasy" });
    state = wizardReducer(state, { type: "SET_TONE", tone: "epic" });
    expect(state.feeling.tone).toBe("epic");

    state = wizardReducer(state, { type: "SET_GENRE", genre: "romance" });
    expect(state.feeling.tone).toBeNull();
  });

  it("tracks generate lifecycle and regenerate attempts", () => {
    let state = createInitialWizardState({ books: BOOKS });
    state = wizardReducer(state, { type: "GENERATE_REQUEST" });

    expect(state.generate.status).toBe("loading");
    expect(state.generate.regenerateCount).toBe(1);

    state = wizardReducer(state, {
      type: "GENERATE_SUCCESS",
      scenes: [{ visual_prompt: "A cold city skyline at dawn.", duration: 5 }],
      caption: "A forbidden promise in the winter dawn.",
      hashtags: ["#booktok"],
      titleCard: "BOOK ONE",
    });

    expect(state.generate.status).toBe("ready");
    expect(state.generate.scenes).toHaveLength(1);
    expect(state.generate.caption).toContain("winter");
  });

  it("tracks build lifecycle and can reset build state", () => {
    let state = createInitialWizardState({ books: BOOKS });

    state = wizardReducer(state, {
      type: "BUILD_QUOTA_FETCHED",
      isProUser: true,
      quotaUsed: 2,
      quotaLimit: 5,
    });
    expect(state.build.status).toBe("confirming");

    state = wizardReducer(state, { type: "BUILD_START" });
    expect(state.build.status).toBe("building");

    state = wizardReducer(state, {
      type: "BUILD_SUCCESS",
      assetId: "asset-1",
      videoUrl: "https://example.com/video.mp4",
      caption: "Done",
    });
    expect(state.build.status).toBe("completed");
    expect(state.build.assetId).toBe("asset-1");

    state = wizardReducer(state, { type: "RESET_BUILD" });
    expect(state.step).toBe("feeling");
    expect(state.generate.status).toBe("idle");
    expect(state.build.status).toBe("idle");
  });
});
