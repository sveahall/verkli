export type AnalyticsEventType =
  | "book_view"
  | "start_reading"
  | "purchase_attempt"
  | "purchase_completed"
  | "pod_purchase_attempt"
  | "pod_purchase_completed"
  | "bookmark_added"
  | "bookmark_removed";

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
    // signal (RLS, queue overload) and should surface once — not retry into a
    // duplicate write with a legacy payload.
    console.warn("[analytics] insert failed", {
      eventType: input.eventType,
      message: error.message,
    });
  }
}
