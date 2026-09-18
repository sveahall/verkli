import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ add: vi.fn(), getJob: vi.fn() }));
vi.mock("bullmq", () => ({ Queue: class { add = mocks.add; getJob = mocks.getJob; } }));
vi.mock("@/lib/env", () => ({ getRedisConnectionOptions: () => ({ host: "localhost", port: 6379 }), getRedisUrl: () => "redis://localhost:6379" }));

import { enqueueTranslationJob } from "./translation-queue";

beforeEach(() => { vi.clearAllMocks(); mocks.getJob.mockResolvedValue(null); mocks.add.mockResolvedValue({ id: "book-en" }); });

describe("translation queue service provenance", () => {
  it("mints one immutable UUID with the queue entry and ignores caller-supplied provenance", async () => {
    const data = { bookId: "book", sourceVersionId: "source", targetLanguage: "en", reviewedRunId: "caller-value", reviewedQueueProtocol: "caller-value" };
    await enqueueTranslationJob(data);
    const stored = mocks.add.mock.calls[0][1];
    expect(stored.reviewedRunId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(stored.reviewedQueueProtocol).toBe("reviewed-atomic-v2");
    expect(data.reviewedRunId).toBe("caller-value");
  });

  it("leaves an existing queued identity untouched on duplicate admission", async () => {
    const existing = { id: "book-en", data: { reviewedRunId: "first" }, getState: async () => "waiting" };
    mocks.getJob.mockResolvedValue(existing);
    await expect(enqueueTranslationJob({ bookId: "book", sourceVersionId: "source", targetLanguage: "en" })).resolves.toBe("book-en");
    expect(existing.data.reviewedRunId).toBe("first");
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
