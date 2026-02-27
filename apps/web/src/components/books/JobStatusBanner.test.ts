import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVisibleJobs } from "./JobStatusBanner";
import type { UnifiedJob } from "@/hooks/useBookJobs";

function makeJob(overrides?: Partial<UnifiedJob>): UnifiedJob {
  return {
    id: "job-1",
    kind: "audiobook",
    status: "running",
    language: null,
    bookVersionId: null,
    progress: 0,
    meta: {},
    error: null,
    createdAt: "2026-02-26T09:20:00.000Z",
    startedAt: "2026-02-26T09:20:10.000Z",
    finishedAt: null,
    ...overrides,
  };
}

describe("getVisibleJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-26T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not mark cancel_requested jobs as stuck", () => {
    const jobs = [
      makeJob({
        meta: {
          controlState: "cancel_requested",
          cancelRequested: true,
        },
      }),
    ];

    const [visible] = getVisibleJobs(jobs);

    expect(visible.status).toBe("running");
    expect(visible.error).toBeNull();
  });

  it("still marks stale active jobs as failed when no pause/cancel is requested", () => {
    const jobs = [makeJob()];

    const [visible] = getVisibleJobs(jobs);

    expect(visible.status).toBe("failed");
    expect(visible.error).toBe("The task appears stuck. Try again.");
  });
});
