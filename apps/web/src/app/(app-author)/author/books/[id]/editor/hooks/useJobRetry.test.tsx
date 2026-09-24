import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UnifiedJob } from "@/hooks/useBookJobs";
const mocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToastHelpers: () => mocks }));
import { useJobRetry } from "./useJobRetry";

const job: UnifiedJob = { id: "import-fixture", kind: "import", status: "failed", language: null,
  bookVersionId: "version-fixture", progress: 0, meta: {}, error: "Import interrupted.",
  createdAt: null, startedAt: null, finishedAt: null };
function setup() {
  const refetch = vi.fn().mockResolvedValue(undefined);
  const capture = vi.fn<(retry: ReturnType<typeof useJobRetry>) => void>();
  function Probe() {
    capture(useJobRetry({ bookId: "book-fixture", activeVersionId: "version-fixture",
      audiobook: { handleGenerateAudiobook: vi.fn() },
      translation: { checkTranslationQueueHealth: vi.fn(), translateTargetLanguage: "en",
        setTranslateTargetLanguage: vi.fn(), setLastRequestedTargetLanguage: vi.fn(),
        setTranslateMessage: vi.fn(), startTranslationPoll: vi.fn() }, refetchBookJob: refetch }));
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return { retry: capture.mock.calls[0][0], refetch };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

it("includes the recovery support reference and prevents another blind attempt", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ error: "IMPORT_RECOVERY_CHECKPOINT_UNAVAILABLE", reference: job.id }, { status: 409 }));
  vi.stubGlobal("fetch", fetcher);
  const { retry, refetch } = setup();
  await retry.handleJobRetry(job);
  expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining(`Support reference: ${job.id}`));
  expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("start a separate new import"));
  await retry.handleJobRetry(job);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(refetch).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});

it("sends only one POST for concurrent clicks", async () => {
  let complete!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const { retry, refetch } = setup();
  const first = retry.handleJobRetry(job);
  const second = retry.handleJobRetry(job);
  expect(fetcher).toHaveBeenCalledOnce();
  complete(Response.json({ ok: true, id: job.id, message: "Import re-queued." }));
  await Promise.all([first, second]);
  expect(refetch).toHaveBeenCalledOnce();
});

it.each([{ ok: false }, {}, null, { ok: true, id: job.id, message: "Import reset; start the worker to process it." }])("does not confirm an invalid HTTP 200 payload %j", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  const { retry, refetch } = setup();
  await retry.handleJobRetry(job);
  expect(mocks.success).not.toHaveBeenCalled();
  expect(refetch).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalled();
});

it("does not blindly repeat a POST after a network failure", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("connection lost"));
  vi.stubGlobal("fetch", fetcher);
  const { retry } = setup();
  await retry.handleJobRetry(job);
  await retry.handleJobRetry(job);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Refresh status"));
  expect(mocks.success).not.toHaveBeenCalled();
});

it("keeps a confirmed enqueue distinct from a later status refresh failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, id: job.id, message: "Import re-queued." })));
  const { retry, refetch } = setup();
  refetch.mockRejectedValueOnce(new Error("read failed"));
  await retry.handleJobRetry(job);
  expect(mocks.error).not.toHaveBeenCalledWith("Could not retry import.");
  expect(mocks.success).toHaveBeenCalledWith("Import re-queued.");
});
