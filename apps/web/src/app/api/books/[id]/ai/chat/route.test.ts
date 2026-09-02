import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The failure these guard, reported 2026-09-02: the author asked the docked
 * assistant "how can I make this chapter open stronger?" and it answered
 * "paste the passage you want to strengthen" — with the chapter on screen
 * immediately beside the panel.
 *
 * The panel had been sending the active chapterId all along. This route
 * accepted it, echoed it back in the response, and never read the chapter, so
 * the model was asked to advise on prose it had never been shown. Nothing threw
 * and nothing logged; the context was simply absent.
 *
 * So the assertion that matters is not "the route returns 200" but "the
 * manuscript reached the model".
 */

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  isAiChatEnabled: vi.fn(),
  generateWritingAssistantReply: vi.fn(),
  check: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/flags", () => ({
  isAiChatEnabled: mocks.isAiChatEnabled,
}));

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({ check: mocks.check }),
}));

vi.mock("@/lib/ai/writing-assistant", () => ({
  generateWritingAssistantReply: mocks.generateWritingAssistantReply,
  WritingAssistantError: class extends Error {},
}));

const { POST } = await import("./route");

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";

const CHAPTER_DOC = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Regnet började precis när Mira nådde hamnen." }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Den sista färjan skulle gå om tio minuter." }],
    },
  ],
});

/** Records every .eq() so the tests can prove the chapter read is scoped. */
type Filter = [string, unknown];

function setupSupabase(options: {
  book?: Record<string, unknown> | null;
  chapter?: Record<string, unknown> | null;
}) {
  const filters: Record<string, Filter[]> = { books: [], chapters: [] };

  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[table]?.push([column, value]);
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: table === "books" ? (options.book ?? null) : (options.chapter ?? null),
            error: null,
          }),
      };
      return builder;
    },
  });

  return filters;
}

function request(body: unknown): NextRequest {
  // NextRequest, not Request: the route's signature takes it, and `npm run
  // build` does not typecheck specs — only `tsc --noEmit` catches the mismatch.
  return new NextRequest(`http://localhost/api/books/${BOOK_ID}/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: BOOK_ID });

describe("POST /api/books/[id]/ai/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });
    mocks.check.mockResolvedValue({ allowed: true });
    mocks.isAiChatEnabled.mockReturnValue(true);
    mocks.generateWritingAssistantReply.mockResolvedValue({
      content: "Open on the letter.",
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
  });

  function assistantInput() {
    return mocks.generateWritingAssistantReply.mock.calls[0][0] as {
      chapterTitle: string | null;
      chapterText: string | null;
      selectedText: string | null;
    };
  }

  it("sends the chapter's prose to the assistant", async () => {
    setupSupabase({
      book: { id: BOOK_ID, author_id: "author-1", title: "Den sista färjan" },
      chapter: {
        id: CHAPTER_ID,
        book_id: BOOK_ID,
        title: "Kapitel 1",
        content: CHAPTER_DOC,
      },
    });

    const res = await POST(
      request({ message: "How can I make this chapter open stronger?", chapterId: CHAPTER_ID }),
      { params }
    );

    expect(res.status).toBe(200);
    const input = assistantInput();
    expect(input.chapterTitle).toBe("Kapitel 1");
    expect(input.chapterText).toContain("Regnet började precis när Mira nådde hamnen.");
    // Paragraph breaks survive: they are what show how the chapter opens.
    expect(input.chapterText).toContain("\n\nDen sista färjan skulle gå om tio minuter.");
  });

  it("scopes the chapter read to the book in the url", async () => {
    const filters = setupSupabase({
      book: { id: BOOK_ID, author_id: "author-1", title: "Den sista färjan" },
      chapter: { id: CHAPTER_ID, book_id: BOOK_ID, title: "Kapitel 1", content: CHAPTER_DOC },
    });

    await POST(request({ message: "Tighten this.", chapterId: CHAPTER_ID }), { params });

    // Without the book_id filter, a chapterId from someone else's book would be
    // pulled into this conversation as context.
    expect(filters.chapters).toEqual(
      expect.arrayContaining([
        ["id", CHAPTER_ID],
        ["book_id", BOOK_ID],
      ])
    );
  });

  it("still answers when the chapter cannot be read, without inventing context", async () => {
    setupSupabase({
      book: { id: BOOK_ID, author_id: "author-1", title: "Den sista färjan" },
      chapter: null,
    });

    const res = await POST(
      request({ message: "Tighten this.", chapterId: CHAPTER_ID }),
      { params }
    );

    expect(res.status).toBe(200);
    expect(assistantInput().chapterText).toBeNull();
    // Losing this context silently is the bug; it must at least be logged.
    expect(console.warn).toHaveBeenCalled();
  });

  it("passes no chapter context when no chapter is open", async () => {
    setupSupabase({
      book: { id: BOOK_ID, author_id: "author-1", title: "Den sista färjan" },
    });

    await POST(request({ message: "Give me a title idea." }), { params });

    const input = assistantInput();
    expect(input.chapterText).toBeNull();
    expect(input.chapterTitle).toBeNull();
  });

  it("treats an empty chapter as no context rather than an empty passage", async () => {
    setupSupabase({
      book: { id: BOOK_ID, author_id: "author-1", title: "Den sista färjan" },
      chapter: {
        id: CHAPTER_ID,
        book_id: BOOK_ID,
        title: "Kapitel 1",
        content: JSON.stringify({ type: "doc", content: [] }),
      },
    });

    await POST(request({ message: "What should happen here?", chapterId: CHAPTER_ID }), {
      params,
    });

    expect(assistantInput().chapterText).toBeNull();
  });

  it("refuses a book the caller does not own", async () => {
    setupSupabase({
      book: { id: BOOK_ID, author_id: "someone-else", title: "Den sista färjan" },
    });

    const res = await POST(request({ message: "Tighten this." }), { params });

    expect(res.status).toBe(403);
    expect(mocks.generateWritingAssistantReply).not.toHaveBeenCalled();
  });
});
