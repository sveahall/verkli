import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared scoping for the author stats routes.
 *
 * Those routes read tables that RLS does not expose to an author session:
 * `analytics_events` carries an INSERT policy and no SELECT policy, and
 * `readings`, `orders`, `bookmarks` and `donations` are keyed to the reader or
 * buyer rather than the author. Reading them through the session client returns
 * empty, which is why the dashboard showed zeros — the numbers were never
 * fake, they were never fetched. `publish/route.ts` already reaches for the
 * service-role client for this reason.
 *
 * The service-role client bypasses RLS, so scoping stops being the database's
 * job and becomes ours. The rule these routes follow:
 *
 *   1. Ask the SESSION client which books belong to the author. RLS enforces
 *      that answer, so the id list cannot contain someone else's book.
 *   2. Query aggregates with the ADMIN client, always constrained to that list.
 *
 * A scoping mistake in step 2 can then only ever under-report the author's own
 * numbers; it cannot surface another author's. Before this package
 * `author/stats/books/route.ts` selected `analytics_events` with no author or
 * book filter at all — harmless only because RLS returned nothing, and a
 * cross-author leak the moment anything widened that read.
 */

export type AuthorBook = { id: string; title: string };

export type AuthorBooksResult =
  | { ok: true; books: AuthorBook[]; bookIds: string[] }
  | { ok: false; message: string };

/**
 * The author's books, resolved through the RLS-backed session client.
 *
 * Pass the session client — never the admin client. Passing the admin client
 * would make `author_id` the only thing standing between one author and
 * another's data, which is the arrangement this helper exists to avoid.
 */
export async function resolveAuthorBooks(
  sessionClient: SupabaseClient,
  userId: string
): Promise<AuthorBooksResult> {
  const { data, error } = await sessionClient
    .from("books")
    .select("id, title")
    .eq("author_id", userId);

  if (error) {
    return { ok: false, message: error.message };
  }

  const books = (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title as string | null) ?? "",
  }));

  return { ok: true, books, bookIds: books.map((b) => b.id) };
}

/**
 * `analytics_events` carries a canonical `book_id`, and every book-scoped
 * emitter in `lib/analytics/events.ts` sets it. Scope reads with this, not with
 * a path match.
 *
 * The migration that created the table (20250209000001) lists only
 * `event_name` and `path` — the live table has since gained `event_type` and
 * `book_id`, one of this repo's known migration drifts. Trusting the migration
 * is what produced the earlier path-matching approach, and it was wrong in a
 * way that looked like it worked: `start_reading` writes the path
 * `/reader/read/<chapterId>`, which does not contain the book id, so every
 * "reads" figure would still have rendered as zero after the RLS fix.
 *
 * Returns null for an empty list. Callers must treat that as "select nothing"
 * and skip the query — an unconstrained read with the service-role client
 * returns every author's events.
 */
export function buildBookIdFilter(bookIds: readonly string[]): string[] | null {
  if (bookIds.length === 0) return null;
  return [...bookIds];
}

/**
 * How a raw event row counts on an author dashboard.
 *
 * Explicit, because the previous classifier matched substrings and treated
 * anything unrecognised as a view. Once service role made these reads return
 * data, that would have counted `first_publish`, `audio_requested` and every
 * `listen_*` event as reader views, and `bookmark_removed` as a bookmark —
 * publishing your own book would have inflated your own view count.
 */
export type StatsEventKind = "view" | "read" | "bookmark_added" | "bookmark_removed";

/**
 * ⚠ Everything derived from `analytics_events` is client-forgeable.
 *
 * `analytics_events_insert_own` (20250210000000_bookmarks.sql) is
 * `FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL)` — no `TO`
 * clause, no constraint on `event_type` or `book_id`. Any anon or authenticated
 * client can therefore insert any event for any book. That was inert while RLS
 * hid these rows from every reader; it stops being inert the moment a
 * service-role client counts them.
 *
 * So views and reads are soft engagement signals and are labelled as such.
 * Purchases are NOT sourced from here: they come from `orders`, which only
 * the service role writes after Stripe settles. A forged event must never be
 * able to tell an author they sold a book they did not sell.
 */

const EVENT_KIND_BY_TYPE: Record<string, StatsEventKind> = {
  book_view: "view",
  start_reading: "read",
  bookmark_added: "bookmark_added",
  bookmark_removed: "bookmark_removed",
};

export type StatsEventRow = {
  event_type?: string | null;
  event_name?: string | null;
};

/**
 * Returns null for events that exist but do not belong on this dashboard —
 * `purchase_attempt` (an intent, not a sale), `first_publish` (the author's own
 * action), `waitlist_signup`, and the `listen_*` / `audio_requested` family.
 *
 * `audio_requested` is deliberately excluded rather than counted: it fires for
 * authors previewing their own book and for admins moderating an unpublished
 * one, flagged in props as `isAuthorPreview` / `isModeratorAdmin`. Counting it
 * without filtering those would report the team's own listening as demand.
 *
 * Reads `event_type` first and falls back to `event_name`: the writer sets both
 * to the same value, but rows written before `event_type` existed carry only
 * the latter.
 */
export function classifyStatsEvent(row: StatsEventRow): StatsEventKind | null {
  const type = (row.event_type ?? row.event_name ?? "").trim();
  return EVENT_KIND_BY_TYPE[type] ?? null;
}

/**
 * The status a settled purchase actually carries.
 *
 * `purchase-receipt.ts` and `pod.ts` both write "paid", and the donations and
 * pod_orders tables constrain status to ('pending','paid','failed') — so
 * "completed" is not merely wrong, it is unwritable. Two revenue queries
 * filtered on it and therefore always summed to zero. Named here so the next
 * revenue query cannot get it wrong by guessing.
 */
export const SETTLED_PAYMENT_STATUS = "paid" as const;

/**
 * Money is stored in minor units. `orders.amount`, `donations.amount` and
 * `author_subscriptions.amount_monthly` are all `integer`, and the reader's own
 * order list renders them as `amount / 100`.
 *
 * The author dashboard formats revenue with a bare currency suffix and does no
 * conversion of its own, so an endpoint that forwards minor units reports
 * revenue 100× too high — a confidently wrong number, which is worse for an
 * author than the zero it replaced.
 */
export function minorToMajor(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}

/** A per-currency revenue tally, so mixed currencies cannot be summed blindly. */
export type CurrencyTotals = Map<string, number>;

export function addToCurrencyTotal(
  totals: CurrencyTotals,
  currency: string | null | undefined,
  amountMinor: number
): void {
  const code = (currency ?? "sek").trim().toLowerCase() || "sek";
  totals.set(code, (totals.get(code) ?? 0) + (Number(amountMinor) || 0));
}

/**
 * The currency carrying the most revenue, and its total in major units.
 *
 * Summing across currencies would produce a number that is not an amount of
 * anything. Reporting the dominant bucket is narrower but true; callers that
 * need the rest read the full map.
 */
export function dominantCurrencyTotal(totals: CurrencyTotals): {
  currency: string;
  total: number;
} {
  let currency = "sek";
  let best = 0;
  for (const [code, minor] of totals) {
    if (minor <= best) continue;
    best = minor;
    currency = code;
  }
  return { currency: currency.toUpperCase(), total: minorToMajor(best) };
}

/**
 * PostgREST caps every response at `max_rows = 1000` (supabase/config.toml).
 * A plain `.select()` used for a total therefore stops at 1000 rows without
 * erroring — the count just quietly stops being the total. Callers that need a
 * true sum must page with `.range()`; callers that need a true count must use
 * `{ count: "exact", head: true }`, which is answered by the database.
 */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Reads every row of a query by paging, so a total is a total.
 *
 * `run(from, to)` must apply `.range(from, to)` to an otherwise-complete query,
 * **and must order by a unique column** — `id` for every table these stats
 * touch.
 *
 * That ordering requirement is not stylistic. Each page is a separate OFFSET
 * query against live data. Without a total order, rows tied on the sort key can
 * land on either side of a page boundary between requests, so a row is read
 * twice or skipped entirely. Ordering by `created_at` alone is not enough:
 * bulk-inserted analytics events routinely share a timestamp. The result is a
 * total that is quietly wrong by a few rows, which is the hardest kind of wrong
 * to notice on a dashboard.
 */
export async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = POSTGREST_MAX_ROWS
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const from = page * pageSize;
    const { data, error } = await run(from, from + pageSize - 1);
    if (error) return { rows, error: error.message };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, error: null };
  }
}
