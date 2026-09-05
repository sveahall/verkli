import { beforeEach, describe, expect, it, vi } from "vitest";

const billingMocks = vi.hoisted(() => ({
  getBillingStateForUser: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => billingMocks);

import * as accessModule from "./access";
import {
  canUserReadBook,
  getReadAccess,
  type SupabaseLikeClient,
} from "./access";

type Row = Record<string, unknown>;
type Filter = { operation: "eq" | "is"; column: string; value: unknown };
type QueryCall = {
  client: QueryAwareSupabase;
  table: string;
  selection: string;
  filters: Filter[];
};
type TransportResponse = { data: unknown; error: unknown };
type ResponseOverride = TransportResponse | { throws: unknown };

type LookupResult =
  | { status: "present" }
  | { status: "absent" }
  | { status: "unavailable"; error: unknown };

type LookupBookPurchaseEntitlement = (args: {
  supabase: SupabaseLikeClient;
  userId: string;
  bookId: string;
}) => Promise<LookupResult>;

const missingChapterColumn = {
  code: "42703",
  message: "column entitlements.chapter_id does not exist",
};

const paidBookContext = {
  bookAuthorId: "author-1",
  bookPriceAmount: 4900,
  bookPricingModel: "book_only",
};

const chapterContext = {
  bookId: "book-1",
  chapterId: "chapter-1",
  bookVersionId: "version-1",
};

function row(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

class QueryAwareSupabase {
  readonly calls: QueryCall[] = [];

  constructor(
    private readonly config: {
      entitlements?: unknown[];
      authorSubscriptions?: unknown[];
      chapters?: unknown[];
      legacySchema?: boolean;
      bookLookupOverride?: ResponseOverride;
      legacyLookupOverride?: ResponseOverride;
      chapterLookupOverride?: ResponseOverride;
    } = {},
  ) {}

  from(table: string) {
    let selection = "";
    const filters: Filter[] = [];

    const query = {
      select(columns: string) {
        selection = columns;
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push({ operation: "eq", column, value });
        return query;
      },
      is(column: string, value: unknown) {
        filters.push({ operation: "is", column, value });
        return query;
      },
      maybeSingle: async () => this.executeMaybeSingle(table, selection, filters),
      order: async () => this.executeMany(table, selection, filters),
    };

    return query;
  }

  private record(table: string, selection: string, filters: Filter[]): QueryCall {
    const call = {
      client: this,
      table,
      selection,
      filters: filters.map((filter) => ({ ...filter })),
    };
    this.calls.push(call);
    return call;
  }

  private isBookLookup(table: string, selection: string, filters: Filter[]) {
    return table === "entitlements"
      && selection === "id"
      && filters.some(
        (filter) => filter.operation === "is" && filter.column === "chapter_id" && filter.value === null,
      );
  }

  private isLegacyLookup(table: string, selection: string, filters: Filter[]) {
    return table === "entitlements"
      && selection === "*"
      && !filters.some((filter) => filter.column === "chapter_id");
  }

  private isChapterLookup(table: string, selection: string, filters: Filter[]) {
    return table === "entitlements"
      && selection === "id"
      && filters.some(
        (filter) => filter.operation === "eq" && filter.column === "chapter_id",
      );
  }

  private applyOverride(override: ResponseOverride): TransportResponse {
    if ("throws" in override) {
      throw override.throws;
    }
    return override;
  }

  private filteredRows(table: string, filters: Filter[]): unknown[] {
    const source = table === "entitlements"
      ? this.config.entitlements ?? []
      : table === "author_subscriptions"
        ? this.config.authorSubscriptions ?? []
        : table === "chapters"
          ? this.config.chapters ?? []
          : [];

    return source.filter((candidate) => {
      if (!row(candidate)) return true;
      return filters.every((filter) => {
        if (filter.operation === "is") return candidate[filter.column] === filter.value;
        return candidate[filter.column] === filter.value;
      });
    });
  }

  private project(candidate: unknown, selection: string): unknown {
    if (!row(candidate) || selection === "*") return candidate;
    const columns = selection.split(",").map((column) => column.trim());
    return Object.fromEntries(columns.map((column) => [column, candidate[column]]));
  }

  private async executeMaybeSingle(
    table: string,
    selection: string,
    filters: Filter[],
  ): Promise<TransportResponse> {
    this.record(table, selection, filters);

    if (this.isBookLookup(table, selection, filters)) {
      if (this.config.bookLookupOverride) {
        return this.applyOverride(this.config.bookLookupOverride);
      }
      if (this.config.legacySchema) {
        return { data: null, error: missingChapterColumn };
      }
    }

    if (this.isLegacyLookup(table, selection, filters) && this.config.legacyLookupOverride) {
      return this.applyOverride(this.config.legacyLookupOverride);
    }

    if (this.isChapterLookup(table, selection, filters) && this.config.chapterLookupOverride) {
      return this.applyOverride(this.config.chapterLookupOverride);
    }

    const matches = this.filteredRows(table, filters);
    if (matches.length > 1) {
      return {
        data: null,
        error: { code: "PGRST116", message: "JSON object requested, multiple rows returned" },
      };
    }
    return {
      data: matches.length === 1 ? this.project(matches[0], selection) : null,
      error: null,
    };
  }

  private async executeMany(
    table: string,
    selection: string,
    filters: Filter[],
  ): Promise<TransportResponse> {
    this.record(table, selection, filters);
    return {
      data: this.filteredRows(table, filters).map((candidate) => this.project(candidate, selection)),
      error: null,
    };
  }
}

async function lookupBookPurchaseEntitlement(args: {
  supabase: SupabaseLikeClient;
  userId: string;
  bookId: string;
}): Promise<LookupResult> {
  const candidate = (accessModule as unknown as {
    lookupBookPurchaseEntitlement?: LookupBookPurchaseEntitlement;
  }).lookupBookPurchaseEntitlement;
  expect(candidate).toBeTypeOf("function");
  if (!candidate) {
    return { status: "unavailable", error: new Error("helper is not implemented") };
  }
  return candidate(args);
}

function asClient(transport: QueryAwareSupabase): SupabaseLikeClient {
  return transport as unknown as SupabaseLikeClient;
}

function fullLegacyEntitlement(overrides: Row = {}): Row {
  return {
    id: "entitlement-1",
    user_id: "reader-1",
    book_id: "book-1",
    source: "purchase",
    ...overrides,
  };
}

beforeEach(() => {
  billingMocks.getBillingStateForUser.mockReset();
  billingMocks.getBillingStateForUser.mockResolvedValue({ ok: false });
});

describe("legacy whole-book purchase compatibility", () => {
  it("restores a legacy buyer in both public access helpers", async () => {
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      entitlements: [fullLegacyEntitlement()],
      chapters: [{ id: "chapter-1", title: "Chapter 1", order: 0, book_version_id: "version-1" }],
    });

    const readAccess = await getReadAccess({
      supabase: asClient(transport),
      userId: "reader-1",
      ...chapterContext,
      ...paidBookContext,
    });
    const canRead = await canUserReadBook({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
      ...paidBookContext,
    });

    expect(readAccess).toEqual({ access: "full", reason: "purchased" });
    expect(canRead).toBe(true);
  });

  it("keeps a legacy non-buyer in preview or locked states", async () => {
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      chapters: [
        { id: "chapter-1", title: "Chapter 1", order: 0, book_version_id: "version-1" },
        { id: "chapter-2", title: "Chapter 2", order: 1, book_version_id: "version-1" },
      ],
    });

    const preview = await getReadAccess({
      supabase: asClient(transport),
      userId: "reader-1",
      ...chapterContext,
      ...paidBookContext,
    });
    const locked = await getReadAccess({
      supabase: asClient(transport),
      userId: "reader-1",
      ...chapterContext,
      chapterId: "chapter-2",
      ...paidBookContext,
    });
    const canRead = await canUserReadBook({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
      ...paidBookContext,
    });

    expect(preview).toEqual({ access: "preview", reason: "first_chapter", isLastPreview: true });
    expect(locked).toEqual({ access: "locked" });
    expect(canRead).toBe(false);
  });

  it.each([
    ["another user", fullLegacyEntitlement({ user_id: "reader-2" })],
    ["another book", fullLegacyEntitlement({ book_id: "book-2" })],
    ["another source", fullLegacyEntitlement({ source: "subscription" })],
  ])("does not grant a row for %s", async (_case, entitlement) => {
    const transport = new QueryAwareSupabase({ legacySchema: true, entitlements: [entitlement] });

    const result = await canUserReadBook({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
      ...paidBookContext,
    });

    expect(result).toBe(false);
  });

  it("retries the exact missing-column failure on the same client and identity", async () => {
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      entitlements: [fullLegacyEntitlement()],
    });

    await expect(lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    })).resolves.toEqual({ status: "present" });

    expect(transport.calls).toHaveLength(2);
    expect(transport.calls.map(({ client, table, selection, filters }) => ({
      sameClient: client === transport,
      table,
      selection,
      filters,
    }))).toEqual([
      {
        sameClient: true,
        table: "entitlements",
        selection: "id",
        filters: [
          { operation: "eq", column: "user_id", value: "reader-1" },
          { operation: "eq", column: "book_id", value: "book-1" },
          { operation: "eq", column: "source", value: "purchase" },
          { operation: "is", column: "chapter_id", value: null },
        ],
      },
      {
        sameClient: true,
        table: "entitlements",
        selection: "*",
        filters: [
          { operation: "eq", column: "user_id", value: "reader-1" },
          { operation: "eq", column: "book_id", value: "book-1" },
          { operation: "eq", column: "source", value: "purchase" },
        ],
      },
    ]);
  });

  it("does not retry a successful modern lookup with no row", async () => {
    const transport = new QueryAwareSupabase();

    await expect(lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    })).resolves.toEqual({ status: "absent" });

    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.selection).toBe("id");
  });

  it("keeps modern whole-book and chapter purchases isolated", async () => {
    const chapterOnly = new QueryAwareSupabase({
      entitlements: [fullLegacyEntitlement({ chapter_id: "chapter-1" })],
    });
    const wholeBook = new QueryAwareSupabase({
      entitlements: [fullLegacyEntitlement({ chapter_id: null })],
    });

    await expect(lookupBookPurchaseEntitlement({
      supabase: asClient(chapterOnly),
      userId: "reader-1",
      bookId: "book-1",
    })).resolves.toEqual({ status: "absent" });
    await expect(lookupBookPurchaseEntitlement({
      supabase: asClient(wholeBook),
      userId: "reader-1",
      bookId: "book-1",
    })).resolves.toEqual({ status: "present" });

    const perChapter = await getReadAccess({
      supabase: asClient(chapterOnly),
      userId: "reader-1",
      ...chapterContext,
      ...paidBookContext,
      bookPricingModel: "per_chapter",
    });
    expect(perChapter).toEqual({ access: "full", reason: "purchased" });
    expect(chapterOnly.calls.filter((call) => call.selection === "*")).toEqual([]);
    expect(chapterOnly.calls.some((call) => call.filters.some(
      (filter) => filter.operation === "eq"
        && filter.column === "chapter_id"
        && filter.value === "chapter-1",
    ))).toBe(true);
  });

  it("fails closed if a schema transition exposes a chapter row to the wildcard retry", async () => {
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      entitlements: [fullLegacyEntitlement({ chapter_id: "chapter-1" })],
    });

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result.status).toBe("unavailable");
  });

  it("treats a present but undefined chapter_id as malformed", async () => {
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      entitlements: [fullLegacyEntitlement({ chapter_id: undefined })],
    });

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result.status).toBe("unavailable");
  });

  it("treats multiple legacy matches as unavailable", async () => {
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      entitlements: [
        fullLegacyEntitlement({ id: "entitlement-1" }),
        fullLegacyEntitlement({ id: "entitlement-2" }),
      ],
    });

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result).toMatchObject({ status: "unavailable", error: { code: "PGRST116" } });
  });

  it.each([
    ["array", [fullLegacyEntitlement()]],
    ["missing id", { user_id: "reader-1", book_id: "book-1", source: "purchase" }],
    ["empty id", fullLegacyEntitlement({ id: "" })],
    ["wrong user type", fullLegacyEntitlement({ user_id: 7 })],
  ])("treats a malformed legacy %s result as unavailable", async (_case, data) => {
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      legacyLookupOverride: { data, error: null },
    });

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result.status).toBe("unavailable");
  });

  it("returns the second query error without granting", async () => {
    const secondError = { code: "57014", message: "statement timeout" };
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      legacyLookupOverride: { data: null, error: secondError },
    });

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result).toEqual({ status: "unavailable", error: secondError });
    expect(transport.calls).toHaveLength(2);
  });

  it("returns a thrown second read as unavailable", async () => {
    const thrown = new Error("legacy transport disconnected");
    const transport = new QueryAwareSupabase({
      legacySchema: true,
      legacyLookupOverride: { throws: thrown },
    });

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result).toEqual({ status: "unavailable", error: thrown });
    expect(transport.calls).toHaveLength(2);
  });

  it.each([
    ["unrelated missing column", { code: "42703", message: "column entitlements.status does not exist" }],
    ["REST schema cache", { code: "PGRST204", message: "column not in schema cache" }],
    ["permission denied", { code: "42501", message: "permission denied" }],
    ["timeout", { code: "57014", message: "statement timeout" }],
    ["internal database error", { code: "XX000", message: "internal error" }],
  ])("does not retry or grant for %s", async (_case, error) => {
    const transport = new QueryAwareSupabase({
      bookLookupOverride: { data: { id: "untrusted" }, error },
    });

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result).toEqual({ status: "unavailable", error });
    expect(transport.calls).toHaveLength(1);
  });

  it("returns a thrown read as unavailable", async () => {
    const thrown = new Error("transport disconnected");
    const transport = new QueryAwareSupabase({
      bookLookupOverride: { throws: thrown },
    });

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    });

    expect(result).toEqual({ status: "unavailable", error: thrown });
    expect(transport.calls).toHaveLength(1);
  });

  it("does not cache a purchase result across users", async () => {
    const transport = new QueryAwareSupabase({
      entitlements: [fullLegacyEntitlement({ chapter_id: null })],
    });

    await expect(lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
    })).resolves.toEqual({ status: "present" });
    await expect(lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "reader-2",
      bookId: "book-1",
    })).resolves.toEqual({ status: "absent" });

    expect(transport.calls.filter((call) => call.table === "entitlements")).toHaveLength(2);
  });

  it("does not grant chapter access when the chapter query returns data with an error", async () => {
    const transport = new QueryAwareSupabase({
      chapterLookupOverride: {
        data: { id: "untrusted-chapter-entitlement" },
        error: { code: "42501", message: "permission denied" },
      },
      chapters: [
        { id: "chapter-1", title: "Chapter 1", order: 0, book_version_id: "version-1" },
        { id: "chapter-2", title: "Chapter 2", order: 1, book_version_id: "version-1" },
      ],
    });

    const result = await getReadAccess({
      supabase: asClient(transport),
      userId: "reader-1",
      ...chapterContext,
      chapterId: "chapter-2",
      ...paidBookContext,
      bookPricingModel: "per_chapter",
    });

    expect(result).toEqual({ access: "locked" });
  });

  it("rejects empty lookup identities without querying", async () => {
    const transport = new QueryAwareSupabase();

    const result = await lookupBookPurchaseEntitlement({
      supabase: asClient(transport),
      userId: "",
      bookId: "book-1",
    });

    expect(result.status).toBe("unavailable");
    expect(transport.calls).toEqual([]);
  });
});

describe("existing access precedence with purchase lookup failures", () => {
  it("keeps free and owner access ahead of purchase lookup", async () => {
    const transport = new QueryAwareSupabase({
      bookLookupOverride: { throws: new Error("must not query") },
    });

    await expect(getReadAccess({
      supabase: asClient(transport),
      userId: null,
      ...chapterContext,
      ...paidBookContext,
      bookPriceAmount: 0,
    })).resolves.toEqual({ access: "full", reason: "free" });
    await expect(canUserReadBook({
      supabase: asClient(transport),
      userId: "author-1",
      bookId: "book-1",
      ...paidBookContext,
    })).resolves.toBe(true);

    expect(transport.calls).toEqual([]);
  });

  it("still grants independently verified Plus access after purchase lookup is unavailable", async () => {
    billingMocks.getBillingStateForUser.mockResolvedValueOnce({
      ok: true,
      state: { isPlusActive: true },
    });
    const transport = new QueryAwareSupabase({
      bookLookupOverride: { data: null, error: { code: "XX000", message: "internal error" } },
    });

    const result = await getReadAccess({
      supabase: asClient(transport),
      userId: "reader-1",
      ...chapterContext,
      ...paidBookContext,
    });

    expect(result).toEqual({ access: "full", reason: "plus" });
  });

  it("still grants an independently verified author subscription", async () => {
    const transport = new QueryAwareSupabase({
      bookLookupOverride: { data: null, error: { code: "42501", message: "permission denied" } },
      authorSubscriptions: [{
        id: "subscription-1",
        subscriber_user_id: "reader-1",
        author_id: "author-1",
        status: "active",
      }],
    });

    const result = await canUserReadBook({
      supabase: asClient(transport),
      userId: "reader-1",
      bookId: "book-1",
      ...paidBookContext,
    });

    expect(result).toBe(true);
  });

  it("preserves preview ordering when purchase lookup is unavailable", async () => {
    const transport = new QueryAwareSupabase({
      bookLookupOverride: { data: null, error: { code: "XX000", message: "internal error" } },
      chapters: [
        { id: "introduction", title: "Introduction", order: 0, book_version_id: "version-1" },
        { id: "chapter-1", title: "Chapter 1", order: 1, book_version_id: "version-1" },
        { id: "chapter-2", title: "Chapter 2", order: 2, book_version_id: "version-1" },
      ],
    });

    const result = await getReadAccess({
      supabase: asClient(transport),
      userId: "reader-1",
      ...chapterContext,
      ...paidBookContext,
    });

    expect(result).toEqual({ access: "preview", reason: "first_chapter", isLastPreview: true });
  });
});
