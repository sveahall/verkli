import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  order: 0,
  firstId: "chapter",
  reading: null as { chapter_id: string } | null,
  readingError: null as { message: string } | null,
  locked: false,
  chapterPatch: {} as Record<string, unknown>,
  logAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics/events", () => ({ logAnalyticsEvent: state.logAnalyticsEvent }));
vi.mock("@/lib/books/access", () => ({
  getReadAccess: async () => ({ access: state.locked ? "locked" : "full", reason: "free" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        not: async () => ({ data: [], error: null }),
        order: async () => ({ data: table === "chapters" ? [
          { id: state.firstId, title: "First", order: state.order },
        ] : [], error: null }),
        maybeSingle: async () => ({
          data: table === "chapters" ? {
            id: "chapter", title: "Private chapter title", order: state.order,
            book_id: "book", book_version_id: "edition", content: "Private manuscript text", ...state.chapterPatch,
          } : table === "books" ? {
            id: "book", title: "Private book title", status: "PUBLISHED", author_id: "author",
          } : table === "readings" ? state.reading : null,
          error: table === "readings" ? state.readingError : null,
        }),
      };
      return query;
    },
  }),
}));

const { default: ReaderReadPage } = await import("./page");
const visit = () => ReaderReadPage({ params: Promise.resolve({ chapterId: "chapter" }) });

describe("reader start event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    Object.assign(state, { user: null, order: 0, firstId: "chapter", reading: null, readingError: null, locked: false, chapterPatch: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([0, 1, 7])("records the actual first chapter with order %i and edition, without manuscript data", async (order) => {
    state.order = order;
    await visit();
    expect(state.logAnalyticsEvent).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      eventType: "start_reading", userId: null, bookId: "book", path: "/reader/read/chapter",
      props: { chapterId: "chapter", chapterOrder: order, bookVersionId: "edition" },
    });
  });

  it("does not mistake the second zero-based chapter for the first", async () => {
    state.order = 1;
    state.firstId = "earlier-chapter";
    await visit();
    expect(state.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("excludes author previews", async () => {
    state.user = { id: "author" };
    await visit();
    expect(state.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("records a signed-in reader's first visit even when entering a later chapter", async () => {
    state.user = { id: "reader" };
    state.firstId = "earlier-chapter";
    await visit();
    expect(state.logAnalyticsEvent).toHaveBeenCalledTimes(1);
  });

  it("does not recount an existing signed-in reading", async () => {
    state.user = { id: "reader" };
    state.reading = { chapter_id: "earlier-chapter" };
    await visit();
    expect(state.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("does not label a failed progress lookup as a first reading", async () => {
    state.user = { id: "reader" };
    state.readingError = { message: "unavailable" };
    await visit();
    expect(state.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("does not record access to a locked chapter", async () => {
    state.locked = true;
    await visit();
    expect(state.logAnalyticsEvent).not.toHaveBeenCalled();
  });
});

const illustrationScope = { bookId: "11111111-1111-4111-8111-111111111111", editionId: "22222222-2222-4222-8222-222222222222", chapterId: "33333333-3333-4333-8333-333333333333" };
const imageNode = { type: "image", attrs: { src: `/api/books/${illustrationScope.bookId}/editions/${illustrationScope.editionId}/chapters/${illustrationScope.chapterId}/illustrations/44444444-4444-4444-8444-444444444444/image`, alt: "A forest" } };
function shownContent(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(shownContent);
  const element = value as { props?: { chapterContent?: unknown; children?: unknown } };
  return [...(element.props?.chapterContent !== undefined ? [element.props.chapterContent] : []), ...shownContent(element.props?.children), ...shownContent(element.props?.chapterContent)];
}
describe("reader illustration content selection", () => {
  beforeEach(() => { vi.stubGlobal("React", React); state.locked = false; state.user = null; });
  afterEach(() => { state.chapterPatch = {}; vi.unstubAllGlobals(); });
  it.each([{ prose: [] }, { prose: [{ type: "paragraph", content: [{ type: "text", text: "Saved prose" }] }] }])("preserves canonical images with surrounding nodes %j", async ({ prose }) => {
    const content = JSON.stringify({ type: "doc", content: [...prose, imageNode] });
    state.chapterPatch = { id: illustrationScope.chapterId, book_id: illustrationScope.bookId, book_version_id: illustrationScope.editionId, content, source_text: "Old fallback" };
    expect(shownContent(await visit())).toContain(content);
  });
  it.each(["", JSON.stringify({ type: "doc", content: [] }), JSON.stringify({ type: "doc", content: [{ ...imageNode, attrs: { ...imageNode.attrs, src: "/not-a-candidate" } }] }), JSON.stringify({ type: "doc", content: [{ ...imageNode, attrs: { ...imageNode.attrs, src: imageNode.attrs.src.replace(illustrationScope.chapterId, illustrationScope.editionId) } }] })])("retains fallback for empty or foreign image content", async (content) => {
    state.chapterPatch = { id: illustrationScope.chapterId, book_id: illustrationScope.bookId, book_version_id: illustrationScope.editionId, content, source_text: "Old fallback" };
    expect(shownContent(await visit())).toContain("Old fallback");
  });
});
