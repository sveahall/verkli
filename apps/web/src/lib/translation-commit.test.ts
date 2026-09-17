import { describe, expect, it, vi } from "vitest";
import { commitReviewedTranslation, TranslationOutcomeUnknownError, type TranslationCommitRequest } from "./translation-commit";

const request = { p_job_id: "job", p_target_version_id: "target", p_chapters: [{ title: "One", content: "Text", order: 0 }] } as TranslationCommitRequest;
const receipt = { jobId: "job", versionId: "target", savedChapters: 1, updatedAt: "2026-09-17T12:00:00Z", replayed: false };
describe("atomic translation caller", () => {
  it("accepts only a matching complete receipt", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
    await expect(commitReviewedTranslation({ rpc }, request)).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith("commit_reviewed_translation", request);
  });
  it("retries the identical request after a lost response and accepts historical replay", async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({ data: { ...receipt, replayed: true }, error: null });
    await expect(commitReviewedTranslation({ rpc }, request)).resolves.toMatchObject({ replayed: true });
    expect(rpc.mock.calls[0][1]).toBe(rpc.mock.calls[1][1]);
  });
  it("keeps an ambiguous first attempt unknown even if the second reports a conflict", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { code: "", message: "fetch failed" } })
      .mockResolvedValueOnce({ data: null, error: { code: "40001", message: "changed owner" } });
    await expect(commitReviewedTranslation({ rpc }, request)).rejects.toBeInstanceOf(TranslationOutcomeUnknownError);
  });
  it("rejects a known rollback without retrying or claiming anything saved", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "changed source" } });
    await expect(commitReviewedTranslation({ rpc }, request)).rejects.toThrow("no chapters were saved");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not turn a malformed success into known failure", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...receipt, jobId: "other" }, error: null });
    await expect(commitReviewedTranslation({ rpc }, request)).rejects.toBeInstanceOf(TranslationOutcomeUnknownError);
  });
});
