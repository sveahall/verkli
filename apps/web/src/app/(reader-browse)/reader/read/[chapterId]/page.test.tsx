import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  order: 0,
  firstId: "chapter",
  reading: null as { chapter_id: string } | null,
  readingError: null as { message: string } | null,
  locked: false,
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
            book_id: "book", book_version_id: "edition", content: "Private manuscript text",
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
    Object.assign(state, { user: null, order: 0, firstId: "chapter", reading: null, readingError: null, locked: false });
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
