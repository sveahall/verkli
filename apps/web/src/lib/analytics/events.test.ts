import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logAnalyticsEvent } from "./events";

function makeSupabaseInsertSpy(insertResult: { error: { message?: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn(() => ({ insert }));
  return { from, insert };
}

describe("logAnalyticsEvent — cohort funnel events", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("emits a waitlist_signup row and does NOT log on success", async () => {
    const supabase = makeSupabaseInsertSpy({ error: null });
    await logAnalyticsEvent(supabase, {
      eventType: "waitlist_signup",
      userId: null,
      path: "/waitlist",
      props: { variant: "author" },
    });

    expect(supabase.from).toHaveBeenCalledWith("analytics_events");
    expect(supabase.insert).toHaveBeenCalledTimes(1);
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "waitlist_signup",
        event_name: "waitlist_signup",
        user_id: null,
        path: "/waitlist",
        props: { variant: "author" },
      })
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("emits a beta_granted row tagged with the granted user_id", async () => {
    const supabase = makeSupabaseInsertSpy({ error: null });
    await logAnalyticsEvent(supabase, {
      eventType: "beta_granted",
      userId: "user-grant-target",
      path: "/admin/users",
      props: { actor_user_id: "admin-1" },
    });

    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "beta_granted",
        user_id: "user-grant-target",
      })
    );
  });

  it("emits a first_publish row with book_id and author user_id", async () => {
    const supabase = makeSupabaseInsertSpy({ error: null });
    await logAnalyticsEvent(supabase, {
      eventType: "first_publish",
      userId: "author-1",
      bookId: "book-1",
      path: "/api/books/book-1/publish",
      props: { scope: "book" },
    });

    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "first_publish",
        user_id: "author-1",
        book_id: "book-1",
      })
    );
  });

  it("emits a start_reading row (first_read source) — sanity guard", async () => {
    const supabase = makeSupabaseInsertSpy({ error: null });
    await logAnalyticsEvent(supabase, {
      eventType: "start_reading",
      userId: "reader-1",
      bookId: "book-9",
      path: "/reader/read/abc",
      props: null,
    });

    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "start_reading",
        user_id: "reader-1",
        book_id: "book-9",
      })
    );
  });

  it("logs to console.error (NOT silent) when the insert fails", async () => {
    const supabase = makeSupabaseInsertSpy({ error: { message: "RLS denied" } });
    await logAnalyticsEvent(supabase, {
      eventType: "waitlist_signup",
      userId: null,
      path: "/waitlist",
      props: null,
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [label, payload] = errorSpy.mock.calls[0];
    expect(label).toBe("[analytics] insert failed");
    expect(payload).toMatchObject({
      eventType: "waitlist_signup",
      message: "RLS denied",
    });
  });
});
