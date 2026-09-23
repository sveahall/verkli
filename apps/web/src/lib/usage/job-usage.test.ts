import { describe, it, expect } from "vitest";
import { jobToUsage, type AiJobRow } from "./job-usage";

const job = (over: Partial<AiJobRow> = {}): AiJobRow => ({
  id: "job-1",
  user_id: "user-1",
  kind: "audiobook_generation",
  book_id: "book-1",
  started_at: "2026-09-22T10:00:00Z",
  finished_at: "2026-09-22T10:02:30Z",
  status: "completed",
  ...over,
});

describe("jobToUsage", () => {
  it("records wall-clock duration in milliseconds against the owning pipeline", () => {
    const out = jobToUsage(job());
    expect(out?.ctx).toMatchObject({
      userId: "user-1",
      pipeline: "tts",
      bookId: "book-1",
      jobId: "job-1",
    });
    expect(out?.events[0]).toMatchObject({ kind: "job", quantity: 150_000, unit: "ms" });
    expect(out?.events[0].meta).toMatchObject({
      job_kind: "audiobook_generation",
      status: "completed",
    });
  });

  it("uses the live status spelling, which is `completed`, not `done`", () => {
    // The schema never constrained this and the plan guessed `done`. Production
    // holds `completed`, so anything keyed to `done` silently matches nothing.
    const out = jobToUsage(job({ status: "completed" }));
    expect(out?.events[0].meta).toMatchObject({ status: "completed" });
  });

  it("records a failed job too, because a crash after spending still cost money", () => {
    const out = jobToUsage(job({ status: "failed" }));
    expect(out?.events[0].meta).toMatchObject({ status: "failed" });
  });

  it("maps both editorial kinds onto the editorial pipeline", () => {
    expect(jobToUsage(job({ kind: "editorial_review" }))?.ctx.pipeline).toBe("editorial");
    expect(jobToUsage(job({ kind: "editorial_book_analysis" }))?.ctx.pipeline).toBe("editorial");
  });

  it("maps translation_quality onto translation", () => {
    expect(jobToUsage(job({ kind: "translation_quality" }))?.ctx.pipeline).toBe("translation");
  });

  it("files an unknown kind under `other` and flags it rather than dropping it", () => {
    const out = jobToUsage(job({ kind: "some_future_job" }));
    expect(out?.ctx.pipeline).toBe("other");
    expect(out?.events[0].meta).toMatchObject({ unmapped_kind: true, job_kind: "some_future_job" });
  });

  it("skips a job that never started rather than inventing a negative duration", () => {
    expect(jobToUsage(job({ started_at: null }))).toBeNull();
  });

  it("skips a job that has not finished", () => {
    expect(jobToUsage(job({ finished_at: null }))).toBeNull();
  });

  it("skips a zero-length job, which measures nothing", () => {
    expect(jobToUsage(job({ finished_at: "2026-09-22T10:00:00Z" }))).toBeNull();
  });

  it("skips a job with no owner, since there is nobody to bill", () => {
    expect(jobToUsage(job({ user_id: null }))).toBeNull();
  });

  it("records the job against the day it finished, not the day it was synced", () => {
    // Jobs are derived from `ai_jobs` long after they ran — the first sync
    // backfilled six months of history. Stamping them `now` put every one of
    // them on the sync date, which makes cost-per-day meaningless and would
    // read as one catastrophic day.
    const out = jobToUsage(
      job({ started_at: "2026-03-05T13:46:00Z", finished_at: "2026-03-05T13:46:43Z" })
    );
    expect(out?.events[0].occurredAt).toBe("2026-03-05T13:46:43Z");
  });
});
