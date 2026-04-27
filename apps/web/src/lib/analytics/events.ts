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
  | "first_publish";

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
