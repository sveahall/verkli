import { describe, expect, it } from "vitest";
import {
  canAdvanceFromStep,
  createInitialWizardState,
  getMaxReachableStep,
  detectGenreFromText,
  autoConfigureForBook,
  extractKeywordsFromText,
  wizardReducer,
} from "@/components/marketing/wizard/wizard-machine";

const BOOKS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Book One",
    cover_image: "https://example.com/cover.jpg",
    description: "Desc",
    chapter_excerpt: "This is the first chapter of the book with some content.",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Book Two",
    cover_image: null,
    description: null,
    chapter_excerpt: null,
  },
];

describe("wizard-machine", () => {
  it("starts in selectBook with first book selected and auto-configured", () => {
    const state = createInitialWizardState({ books: BOOKS });

    expect(state.step).toBe("selectBook");
    expect(state.selectedBookId).toBe(BOOKS[0].id);
    expect(state.feeling.genre).not.toBeNull();
    expect(state.feeling.tone).not.toBeNull();
    expect(state.generate.status).toBe("idle");
    expect(state.build.status).toBe("idle");
  });

  it("skips to configure when initialBookId is provided", () => {
    const state = createInitialWizardState({
      books: BOOKS,
      initialBookId: BOOKS[0].id,
    });

    expect(state.step).toBe("configure");
    expect(state.selectedBookId).toBe(BOOKS[0].id);
  });

  it("skips to configure when there is only one book", () => {
    const state = createInitialWizardState({
      books: [BOOKS[0]],
    });

    expect(state.step).toBe("configure");
  });

  it("enforces progression gates per step", () => {
    let state = createInitialWizardState({ books: BOOKS });
    expect(canAdvanceFromStep(state, "selectBook")).toBe(true);

    state = wizardReducer(state, { type: "NEXT_STEP" });
    expect(state.step).toBe("configure");

    // Auto-configured so should be advanceable if description has content
    state = wizardReducer(state, {
      type: "SET_DESCRIPTION",
      description: "En dramatisk resa genom svek, hopp och forsoning.",
    });
    state = wizardReducer(state, {
      type: "SET_KEYWORDS",
      keywords: ["drama"],
    });
    expect(canAdvanceFromStep(state, "configure")).toBe(true);
    expect(getMaxReachableStep(state)).toBe("result");
  });

  it("auto-detects genre and tone when selecting a book", () => {
    let state = createInitialWizardState({ books: BOOKS });

    state = wizardReducer(state, {
      type: "SELECT_BOOK",
      bookId: BOOKS[0].id,
    });

    expect(state.feeling.genre).not.toBeNull();
    expect(state.feeling.tone).not.toBeNull();
  });

  it("keeps tone when switching to genre where tone is still valid", () => {
    let state = createInitialWizardState({ books: BOOKS });

    // Set to thriller with suspenseful tone
    state = wizardReducer(state, { type: "SET_GENRE", genre: "thriller" });
    state = wizardReducer(state, { type: "SET_TONE", tone: "suspenseful" });
    expect(state.feeling.tone).toBe("suspenseful");

    // Switch to fantasy — suspenseful not in fantasy tones, should reset
    state = wizardReducer(state, { type: "SET_GENRE", genre: "fantasy" });
    expect(state.feeling.tone).toBe("epic"); // default for fantasy

    // Switch to thriller — epic not in thriller tones, should reset
    state = wizardReducer(state, { type: "SET_GENRE", genre: "thriller" });
    expect(state.feeling.tone).toBe("suspenseful"); // default for thriller
  });

  it("tracks generate lifecycle and regenerate attempts", () => {
    let state = createInitialWizardState({ books: BOOKS });
    state = wizardReducer(state, { type: "GENERATE_REQUEST" });

    expect(state.generate.status).toBe("loading");
    expect(state.generate.regenerateCount).toBe(1);

    state = wizardReducer(state, {
      type: "GENERATE_SUCCESS",
      scenes: [
        { visual_prompt: "A cold city skyline at dawn.", duration: 5 },
      ],
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
    expect(state.step).toBe("configure");
    expect(state.generate.status).toBe("idle");
    expect(state.build.status).toBe("idle");
  });

  it("hydrates persisted state and re-fills empty keywords from book", () => {
    const initial = createInitialWizardState({ books: BOOKS });
    const hydrated = wizardReducer(initial, {
      type: "HYDRATE_PERSISTED",
      persisted: {
        step: "result",
        selectedBookId: BOOKS[1].id,
        feeling: { genre: "fantasy", tone: "epic" },
        story: { description: "Kort text", keywords: [] },
        generate: initial.generate,
        build: initial.build,
      },
    });

    expect(hydrated.selectedBookId).toBe(BOOKS[1].id);
    // Auto-fill should populate keywords from book data, making result reachable
    expect(hydrated.story.keywords.length).toBeGreaterThan(0);
    expect(hydrated.step).toBe("result");
  });

  it("hydrates persisted state and re-fills empty description from book", () => {
    const initial = createInitialWizardState({ books: BOOKS });
    const hydrated = wizardReducer(initial, {
      type: "HYDRATE_PERSISTED",
      persisted: {
        step: "result",
        selectedBookId: BOOKS[0].id,
        feeling: { genre: "romance", tone: "passionate" },
        story: { description: "", keywords: ["drama"] },
        generate: initial.generate,
        build: initial.build,
      },
    });

    // Auto-fill should populate description from book data
    expect(hydrated.story.description.length).toBeGreaterThan(0);
    expect(hydrated.step).toBe("result");
  });

  describe("detectGenreFromText", () => {
    it("detects biography", () => {
      expect(
        detectGenreFromText(
          "Berättelsen om hans liv som entreprenör och generation som tar över"
        )
      ).toBe("biography");
    });

    it("detects romance", () => {
      expect(
        detectGenreFromText("En kärlek som förändrar allt, en kyss i regnet")
      ).toBe("romance");
    });

    it("detects fantasy", () => {
      expect(
        detectGenreFromText("En resa genom ett kungarike av magi och trolldom")
      ).toBe("fantasy");
    });

    it("detects thriller", () => {
      expect(
        detectGenreFromText("Mord i det tysta, polis jagar en misstänkt")
      ).toBe("thriller");
    });

    it("falls back to literary", () => {
      expect(
        detectGenreFromText("En stilla betraktelse av livet")
      ).toBe("literary");
    });
  });

  describe("extractKeywordsFromText", () => {
    it("extracts meaningful words", () => {
      const keywords = extractKeywordsFromText(
        "En dramatisk resa genom svek, hopp och forsoning i Stockholm"
      );
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.length).toBeLessThanOrEqual(5);
    });

    it("respects maxKeywords", () => {
      const keywords = extractKeywordsFromText(
        "kärlek magi drake svärd kungarike hopp forsoning",
        3
      );
      expect(keywords.length).toBeLessThanOrEqual(3);
    });
  });

  describe("autoConfigureForBook", () => {
    it("auto-configures genre, tone, description, keywords", () => {
      const config = autoConfigureForBook({
        title: "Inget kan stoppa oss nu!",
        description: null,
        chapter_excerpt:
          "Berättelsen om en generation som tar över. En biografi om entreprenören bakom succén.",
      });

      expect(config.genre).toBe("biography");
      expect(config.tone).toBe("intense");
      expect(config.description).toContain("generation");
      expect(config.keywords.length).toBeGreaterThan(0);
    });
  });
});
