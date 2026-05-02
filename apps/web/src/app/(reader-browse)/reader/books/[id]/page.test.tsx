import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown };
type QueryMethod = "from" | "select" | "eq" | "not" | "order" | "maybeSingle";
type QueryCall = { table: string; method: QueryMethod; args: unknown[] };

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  not: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  then: Promise<QueryResult>["then"];
  catch: Promise<QueryResult>["catch"];
  finally: Promise<QueryResult>["finally"];
};

const mocks = vi.hoisted(() => ({
  canUserReadBook: vi.fn(),
  capturePostHog: vi.fn(),
  createClient: vi.fn(),
  logAnalyticsEvent: vi.fn(() => Promise.resolve()),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("next/image", () => ({
  default: "img",
}));

vi.mock("next/link", () => ({
  default: "a",
}));

vi.mock("lucide-react", () => ({
  Lock: () => null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/books/access", () => ({
  canUserReadBook: mocks.canUserReadBook,
}));

vi.mock("@/lib/analytics/events", () => ({
  logAnalyticsEvent: mocks.logAnalyticsEvent,
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  capturePostHog: mocks.capturePostHog,
}));

vi.mock("./StartReadingLink", () => ({
  default: () => null,
}));

vi.mock("./BookmarkButton", () => ({
  default: () => null,
}));

vi.mock("./OfflineSaveButton", () => ({
  default: () => null,
}));

vi.mock("./PurchaseBookButton", () => ({
  default: () => null,
}));

vi.mock("./PurchaseChapterButton", () => ({
  default: () => null,
}));

vi.mock("./PurchaseSuccessRefresh", () => ({
  default: () => null,
}));

vi.mock("./OrderPhysicalCopyButton", () => ({
  default: () => null,
}));

vi.mock("./BookReviewsSection", () => ({
  default: () => null,
}));

vi.mock("./CommentsSection", () => ({
  default: () => null,
}));

vi.mock("@/app/(reader-browse)/reader/authors/[id]/FollowAuthorButton", () => ({
  default: () => null,
}));

vi.mock("@/components/reader/SimilarBooksRail", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/Skeleton", () => ({
  Skeleton: () => null,
}));

vi.mock("@/features/reader/reader-book/ReaderBookPageView", () => ({
  default: () => null,
}));

const { default: ReaderBookDetail } = await import("./page");

function createQueryBuilder(
  table: string,
  result: QueryResult,
  calls: QueryCall[]
): QueryBuilder {
  const record = (method: QueryMethod, args: unknown[]) => {
    calls.push({ table, method, args });
  };
  const promise = () => Promise.resolve(result);
  const builder: QueryBuilder = {
    select: (...args) => {
      record("select", args);
      return builder;
    },
    eq: (...args) => {
      record("eq", args);
      return builder;
    },
    not: (...args) => {
      record("not", args);
      return builder;
    },
    order: (...args) => {
      record("order", args);
      return builder;
    },
    maybeSingle: () => {
      record("maybeSingle", []);
      return promise();
    },
    then: (...args) => promise().then(...args),
    catch: (...args) => promise().catch(...args),
    finally: (...args) => promise().finally(...args),
  };

  return builder;
}

function createSupabaseMock() {
  const calls: QueryCall[] = [];
  const responses: Record<string, QueryResult> = {
    books: {
      data: {
        id: "book-1",
        title: "Serial Story",
        description: "A book sold by chapter.",
        cover_image: null,
        status: "PUBLISHED",
        author_id: "author-1",
        language: "en",
        original_language: null,
        original_url: null,
        audiobook_status: null,
        price_amount: 499,
        price_currency: "USD",
        pricing_model: "per_chapter",
        print_on_demand_settings: null,
        trailer_url: null,
      },
    },
    book_versions: {
      data: [
        {
          id: "version-1",
          language_code: "en",
          published_at: "2026-05-02T10:00:00.000Z",
        },
      ],
    },
    profiles: {
      data: {
        display_name: "Test Author",
        username: "author",
      },
    },
    book_genres: { data: [] },
    chapters: {
      data: [
        { id: "chapter-1", title: "Chapter 1", order: 1 },
        { id: "chapter-2", title: "Chapter 2", order: 2 },
      ],
    },
    reviews: { data: [] },
    follows: { data: null },
    entitlements: {
      data: [{ chapter_id: "chapter-2" }],
    },
  };
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: { id: "user-1" },
        },
      })),
    },
    from: vi.fn((table: string) => {
      calls.push({ table, method: "from", args: [] });
      return createQueryBuilder(table, responses[table] ?? { data: null }, calls);
    }),
  };

  return { calls, client };
}

describe("ReaderBookDetail per-chapter access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads purchased chapter entitlements even without full-book read access", async () => {
    const { calls, client } = createSupabaseMock();
    mocks.createClient.mockResolvedValue(client);
    mocks.canUserReadBook.mockResolvedValue(false);

    await ReaderBookDetail({
      params: Promise.resolve({ id: "book-1" }),
      searchParams: Promise.resolve({}),
    });

    expect(calls).toContainEqual({
      table: "entitlements",
      method: "from",
      args: [],
    });
    expect(calls).toContainEqual({
      table: "entitlements",
      method: "eq",
      args: ["user_id", "user-1"],
    });
    expect(calls).toContainEqual({
      table: "entitlements",
      method: "eq",
      args: ["book_id", "book-1"],
    });
    expect(calls).toContainEqual({
      table: "entitlements",
      method: "not",
      args: ["chapter_id", "is", null],
    });
    expect(calls.some((call) => call.table === "readings")).toBe(false);
    expect(calls.some((call) => call.table === "bookmarks")).toBe(false);
  });
});
