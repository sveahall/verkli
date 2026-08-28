import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  addToCurrencyTotal,
  buildBookIdFilter,
  classifyStatsEvent,
  dominantCurrencyTotal,
  fetchAllRows,
  minorToMajor,
  resolveAuthorBooks,
  SETTLED_PAYMENT_STATUS,
  type CurrencyTotals,
} from "./stats-scope";

function fakeSessionClient(result: { data?: unknown; error?: { message: string } }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as never, from, select, eq };
}

describe("resolveAuthorBooks", () => {
  it("scopes the lookup to the author", async () => {
    const { client, from, select, eq } = fakeSessionClient({
      data: [{ id: "book-1", title: "Regnet" }],
    });

    const result = await resolveAuthorBooks(client, "author-1");

    expect(from).toHaveBeenCalledWith("books");
    expect(select).toHaveBeenCalledWith("id, title");
    expect(eq).toHaveBeenCalledWith("author_id", "author-1");
    expect(result).toEqual({
      ok: true,
      books: [{ id: "book-1", title: "Regnet" }],
      bookIds: ["book-1"],
    });
  });

  it("reports the error instead of pretending the author has no books", async () => {
    const { client } = fakeSessionClient({ error: { message: "permission denied" } });
    const result = await resolveAuthorBooks(client, "author-1");
    // A failed lookup that returned `ok: true, bookIds: []` would render as a
    // clean "no activity yet" — the exact confusion this package removes.
    expect(result).toEqual({ ok: false, message: "permission denied" });
  });

  it("tolerates a null title", async () => {
    const { client } = fakeSessionClient({ data: [{ id: "b", title: null }] });
    const result = await resolveAuthorBooks(client, "a");
    expect(result).toEqual({ ok: true, books: [{ id: "b", title: "" }], bookIds: ["b"] });
  });
});

describe("buildBookIdFilter", () => {
  it("passes the ids through for an .in() filter", () => {
    expect(buildBookIdFilter(["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns null for no books, so callers skip the query entirely", () => {
    // With the service-role client an unconstrained read returns every
    // author's events. Returning null forces the caller to branch.
    expect(buildBookIdFilter([])).toBeNull();
  });
});

describe("classifyStatsEvent", () => {
  it("maps the reader-facing events onto dashboard counters", () => {
    expect(classifyStatsEvent({ event_type: "book_view" })).toBe("view");
    expect(classifyStatsEvent({ event_type: "start_reading" })).toBe("read");
    expect(classifyStatsEvent({ event_type: "bookmark_added" })).toBe("bookmark_added");
    expect(classifyStatsEvent({ event_type: "bookmark_removed" })).toBe("bookmark_removed");
  });

  it("never classifies a purchase — analytics_events is client-forgeable", () => {
    // analytics_events_insert_own is FOR INSERT WITH CHECK (auth.uid() =
    // user_id OR user_id IS NULL) with no TO clause and no constraint on
    // event_type or book_id, so any client can insert these rows. Purchases
    // must come from `orders`, which only the service role writes.
    expect(classifyStatsEvent({ event_type: "purchase_completed" })).toBeNull();
    expect(classifyStatsEvent({ event_type: "pod_purchase_completed" })).toBeNull();
  });

  it("ignores the author's own publish event", () => {
    // The old substring classifier counted anything unrecognised as a view, so
    // publishing your own book bumped your own view count.
    expect(classifyStatsEvent({ event_type: "first_publish" })).toBeNull();
  });

  it("ignores audio_requested, which fires for author previews and admins", () => {
    expect(classifyStatsEvent({ event_type: "audio_requested" })).toBeNull();
    expect(classifyStatsEvent({ event_type: "listen_start" })).toBeNull();
    expect(classifyStatsEvent({ event_type: "listen_progress" })).toBeNull();
  });

  it("ignores purchase_attempt — an intent is not a sale", () => {
    expect(classifyStatsEvent({ event_type: "purchase_attempt" })).toBeNull();
  });

  it("falls back to event_name for rows written before event_type existed", () => {
    expect(classifyStatsEvent({ event_name: "book_view" })).toBe("view");
  });

  it("returns null for an unknown or empty event", () => {
    expect(classifyStatsEvent({ event_type: "something_new" })).toBeNull();
    expect(classifyStatsEvent({})).toBeNull();
  });
});

describe("SETTLED_PAYMENT_STATUS", () => {
  it('is "paid" — the status purchase-receipt.ts actually writes', () => {
    expect(SETTLED_PAYMENT_STATUS).toBe("paid");
  });

  it("is not 'completed', which the donations CHECK constraint forbids outright", () => {
    // Two revenue queries filtered on "completed" and therefore always summed
    // to zero. donations.status is CHECK (status IN ('pending','paid','failed')),
    // so no row could ever have carried it.
    expect(SETTLED_PAYMENT_STATUS).not.toBe("completed");
  });
});

describe("money", () => {
  it("converts minor units to major", () => {
    // orders.amount is `integer` and the reader's order list renders it as
    // amount / 100, so 14900 is 149 kr — not 14 900 kr.
    expect(minorToMajor(14900)).toBe(149);
    expect(minorToMajor(499)).toBe(4.99);
    expect(minorToMajor(0)).toBe(0);
  });

  it("tallies per currency and defaults a missing code to sek", () => {
    const totals: CurrencyTotals = new Map();
    addToCurrencyTotal(totals, "SEK", 10000);
    addToCurrencyTotal(totals, "sek", 5000);
    addToCurrencyTotal(totals, null, 100);
    addToCurrencyTotal(totals, "eur", 2000);
    expect(totals.get("sek")).toBe(15100);
    expect(totals.get("eur")).toBe(2000);
  });

  it("reports the largest currency rather than summing across currencies", () => {
    // Adding SEK to EUR produces a number that is not an amount of anything.
    const totals: CurrencyTotals = new Map([
      ["sek", 20000],
      ["eur", 5000],
    ]);
    expect(dominantCurrencyTotal(totals)).toEqual({ currency: "SEK", total: 200 });
  });

  it("falls back to SEK zero when there is no revenue at all", () => {
    expect(dominantCurrencyTotal(new Map())).toEqual({ currency: "SEK", total: 0 });
  });
});

describe("fetchAllRows", () => {
  it("keeps paging until a short page arrives", async () => {
    // PostgREST caps responses at max_rows = 1000 without erroring, so a
    // single select silently reports the first page as the total.
    const pages = [
      Array.from({ length: 3 }, (_, i) => ({ n: i })),
      Array.from({ length: 3 }, (_, i) => ({ n: 3 + i })),
      [{ n: 6 }],
    ];
    const calls: Array<[number, number]> = [];
    const run = async (from: number, to: number) => {
      calls.push([from, to]);
      return { data: pages.shift() ?? [], error: null };
    };

    const { rows, error } = await fetchAllRows(run, 3);

    expect(error).toBeNull();
    expect(rows).toHaveLength(7);
    expect(calls).toEqual([
      [0, 2],
      [3, 5],
      [6, 8],
    ]);
  });

  it("stops immediately when the first page is short", async () => {
    let calls = 0;
    const { rows } = await fetchAllRows(async () => {
      calls++;
      return { data: [{ n: 1 }], error: null };
    }, 10);
    expect(calls).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it("returns the error and the rows gathered so far", async () => {
    let call = 0;
    const { rows, error } = await fetchAllRows(async () => {
      call++;
      if (call === 1) return { data: [{ n: 1 }, { n: 2 }], error: null };
      return { data: null, error: { message: "boom" } };
    }, 2);
    expect(error).toBe("boom");
    expect(rows).toHaveLength(2);
  });
});

/**
 * Source-level guard. `author/stats/books/route.ts` used to select
 * `analytics_events` with no author or book filter — harmless only because RLS
 * returned nothing. Now that the route holds a service-role client, an
 * unscoped read there would return every author's events, so the absence of
 * that filter is a cross-author leak rather than a missed optimisation.
 */
describe("author stats routes never read analytics_events unscoped", () => {
  const routes = [
    "../../app/api/author/stats/route.ts",
    "../../app/api/author/stats/books/route.ts",
    "../../app/api/books/[id]/stats/route.ts",
  ];

  for (const relative of routes) {
    it(`${relative} scopes its analytics_events read by book_id`, () => {
      const source = readFileSync(path.join(__dirname, relative), "utf8");
      const marker = 'from("analytics_events")';
      const start = source.indexOf(marker);
      expect(start, `${relative} no longer reads analytics_events`).toBeGreaterThan(-1);

      // Everything up to the end of the query chain must constrain book_id.
      // These routes hold a service-role client, so an unscoped read here
      // returns every author's events rather than none.
      const chain = source.slice(start, source.indexOf(";", start));
      expect(chain, `${relative} reads analytics_events without a book_id filter`).toMatch(
        /\.(in|eq)\("book_id"/
      );
    });
  }

  it("sources purchases from orders, not from forgeable events", () => {
    for (const relative of [
      "../../app/api/author/stats/route.ts",
      "../../app/api/author/stats/books/route.ts",
      "../../app/api/books/[id]/stats/route.ts",
    ]) {
      const source = readFileSync(path.join(__dirname, relative), "utf8");
      expect(source, `${relative} must read orders for purchases`).toContain(
        'from("orders")'
      );
      expect(source, `${relative} must filter orders by settled status`).toContain(
        "SETTLED_PAYMENT_STATUS"
      );
    }
  });

  it("emits a purchases field on every daily chart point", () => {
    // AnalyticsCharts computes Math.max(...[d.views, d.reads, d.purchases]);
    // one undefined there makes every coordinate NaN and the chart vanishes.
    for (const relative of [
      "../../app/api/author/stats/route.ts",
      "../../app/api/books/[id]/stats/route.ts",
    ]) {
      const source = readFileSync(path.join(__dirname, relative), "utf8");
      expect(source, `${relative} daily map must carry purchases`).toContain(
        "{ views: 0, reads: 0, purchases: 0 }"
      );
    }
  });

  it("filters soft-deleted rows as soon as the column exists", () => {
    // `20260429121000_soft_delete_columns.sql` adds `deleted_at` plus a
    // RESTRICTIVE RLS policy that hides soft-deleted rows from anon and
    // authenticated reads. Service role bypasses RLS, so the moment that
    // migration is applied these admin reads would surface content that
    // moderation or a GDPR request removed.
    //
    // The migration is NOT applied to the live database yet — `types.ts` is
    // generated from it and shows no `deleted_at` — so adding the filter today
    // would error on a column that does not exist. This guard fails the moment
    // it does exist, which is exactly when the filter becomes both possible
    // and necessary.
    const types = readFileSync(
      path.join(__dirname, "../supabase/types.ts"),
      "utf8"
    );
    const softDeleteLive = /comments: \{[\s\S]*?Row: \{[\s\S]*?deleted_at/.test(types);

    if (!softDeleteLive) {
      expect(softDeleteLive).toBe(false);
      return;
    }

    for (const relative of [
      "../../app/api/author/stats/engagement/route.ts",
      "../../app/(app-author)/author/home/page.tsx",
      "../../app/(app-author)/author/analytics/[metric]/page.tsx",
    ]) {
      const source = readFileSync(path.join(__dirname, relative), "utf8");
      if (!source.includes('from("comments")') && !source.includes('from("reviews")')) continue;
      expect(
        source,
        `${relative} reads comments/reviews with the admin client but does not filter deleted_at`
      ).toMatch(/\.is\("deleted_at", null\)/);
    }
  });

  it("author/stats/books refuses to query when the author has no books", () => {
    const source = readFileSync(
      path.join(__dirname, "../../app/api/author/stats/books/route.ts"),
      "utf8"
    );
    expect(source).toContain("if (owned.books.length === 0)");
  });
});
