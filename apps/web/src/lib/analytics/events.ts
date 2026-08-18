export type AnalyticsEventType =
  | "book_view"
  | "start_reading"
  | "purchase_attempt"
  | "purchase_completed"
  | "pod_purchase_attempt"
  | "pod_purchase_completed"
  | "bookmark_added"
  | "bookmark_removed"
  // Cohort funnel events (PR 2 observability). Emitted from waitlist, admin
  // grant, and publish flows; consumed by /api/admin/metrics/funnel.
  | "waitlist_signup"
  | "beta_granted"
  | "first_publish"
  // Audio funnel (WP-03). Audiobook rendering costs real ElevenLabs money and
  // is sold as a paid feature, but until these existed there was no way to
  // answer "has a reader ever pressed play".
  //
  // `audio_requested` is emitted server-side by the audiobook play route when
  // it hands out a signed URL. It is the unbypassable floor: no audio can be
  // heard without one. It is NOT a play — the reader player fetches on mount
  // with preload="none", so this counts "audio was made available".
  //
  // `listen_start` / `listen_progress` / `listen_complete` come from the real
  // <audio> element via /api/books/[id]/audiobook/progress, so the pair
  // audio_requested → listen_start is the request-to-play conversion rate.
  | "audio_requested"
  | "listen_start"
  | "listen_progress"
  | "listen_complete";

type SupabaseLikeClient = {
  from: (table: string) => unknown;
};

type LogAnalyticsEventInput = {
  eventType: AnalyticsEventType;
  userId?: string | null;
  bookId?: string | null;
  path?: string | null;
  props?: Record<string, unknown> | null;
};

/**
 * Writes analytics events in a backwards-compatible way.
 * New schema uses event_type + book_id, while legacy readers still use event_name.
 *
 * ── RLS: why the bare `.insert()` below is load-bearing (WP-03) ─────────────
 *
 * `analytics_events` has RLS enabled. `20250209000001_analytics_events.sql`
 * created it with **no** policies at all and documents it as "service role
 * only", and `docs/DATABASE_ARCHITECTURE.md` still lists it that way — but
 * `20250210000000_bookmarks.sql:33-36` later added, for the bookmark events:
 *
 *     CREATE POLICY analytics_events_insert_own ON public.analytics_events
 *       FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
 *
 * No `TO` clause, so it applies to `anon` and `authenticated` alike. That
 * policy is live in production and it is the only reason session-client
 * emission works. Verified against the live DB 2026-08-18:
 *
 *   anon insert, no .select()  → OK (row lands)
 *   anon insert with .select() → 42501 new row violates row-level security
 *   anon select                → 0 rows, no error (RLS filters silently)
 *
 * There is still no SELECT policy, and PostgREST needs SELECT to satisfy
 * `Prefer: return=representation`. So **do not add `.select()` or `.single()`
 * to this insert** and do not chain them at any call site using a session
 * client — the write starts failing with 42501 the moment you do, and RLS
 * denial is indistinguishable from success to a caller that ignores `error`.
 *
 * Corollary: the comment at `api/books/[id]/publish/route.ts` claiming
 * "analytics_events RLS blocks the author session" is wrong as written. Using
 * the admin client there is still correct, but for a different reason: an admin
 * publishing someone else's book writes `user_id = author_id != auth.uid()`,
 * which the WITH CHECK above genuinely does reject.
 *
 * New server-side emitters should prefer the admin client: it is immune to both
 * the return=minimal trap and the actor-mismatch trap.
 */
export async function logAnalyticsEvent(
  supabase: SupabaseLikeClient,
  input: LogAnalyticsEventInput
): Promise<void> {
  const table = supabase.from("analytics_events" as never) as {
    insert: (payload: unknown) => Promise<{ error: { message?: string } | null }>;
  };

  const payload = {
    event_type: input.eventType,
    event_name: input.eventType,
    user_id: input.userId ?? null,
    book_id: input.bookId ?? null,
    path: input.path ?? null,
    props: input.props ?? null,
  };

  const { error } = await table.insert(payload as never);
  if (error) {
    // Post-migration, the new columns always exist. A failure here is a real
    // signal (RLS, queue overload, transient network) and must NOT be silent.
    // PR 2 observability requires structured error logging on every failed
    // metric write so the soft-launch funnel doesn't quietly under-count.
    console.error("[analytics] insert failed", {
      eventType: input.eventType,
      userId: input.userId ?? null,
      bookId: input.bookId ?? null,
      path: input.path ?? null,
      message: error.message,
    });
  }
}
