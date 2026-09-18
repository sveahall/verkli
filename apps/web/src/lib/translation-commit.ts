import type { TranslationQualityRecord } from "./translation-quality-report";

export const REVIEWED_TRANSLATION_PROTOCOL = "reviewed-atomic-v2";
/** Enable only after S1 + DELETE, exact RPC, schema verification and old-worker drain. */
export function reviewedTranslationActivationReady(): boolean {
  return process.env.REVIEWED_TRANSLATION_ATOMIC_ENABLED === "true";
}

export type TranslationChapterBaseline = {
  id: string; title: string | null; content: string | null; order: number;
  updated_at: string; version_number: number; deleted_at: string | null;
};
export type TranslationCommitRequest = {
  p_book_id: string; p_author_id: string; p_source_version_id: string; p_target_version_id: string;
  p_claim_marker: string; p_claim_revision: string; p_expected_source: TranslationChapterBaseline[];
  p_expected_target: TranslationChapterBaseline[];
  p_chapters: Array<{ title: string; content: string; source_text: string; content_hash: string; order: number }>;
  p_scope: "book" | "chapter"; p_overwrite: boolean; p_source_revision: string;
  p_job_id: string; p_job_revision: string; p_final_report: TranslationQualityRecord;
};
export type TranslationCommitReceipt = { jobId: string; versionId: string; updatedAt: string; savedChapters: number; replayed: boolean };
type RpcClient = { rpc: (name: string, request: TranslationCommitRequest) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
export class TranslationOutcomeUnknownError extends Error {
  constructor() { super("Checking whether your translation was saved. Do not start another translation while this run is being reconciled."); this.name = "TranslationOutcomeUnknownError"; }
}
export function isTranslationCommitReceipt(value: unknown, jobId: string, targetId: string): value is TranslationCommitReceipt {
  const row = value as Partial<TranslationCommitReceipt> | null;
  return !!row && row.jobId === jobId && row.versionId === targetId && typeof row.updatedAt === "string" &&
    Number.isFinite(Date.parse(row.updatedAt)) && Number.isSafeInteger(row.savedChapters) && row.savedChapters! > 0 && typeof row.replayed === "boolean";
}

/** Retry only this exact in-memory request. No baseline refresh, paid work, or write fallback. */
export async function commitReviewedTranslation(client: RpcClient, request: TranslationCommitRequest): Promise<TranslationCommitReceipt> {
  let ambiguous = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let result;
    try { result = await client.rpc("commit_reviewed_translation", request); }
    catch { ambiguous = true; continue; }
    if (!result.error && isTranslationCommitReceipt(result.data, request.p_job_id, request.p_target_version_id) && result.data.savedChapters === request.p_chapters.length) return result.data;
    // Only recognized server rollback classes establish a failed transaction.
    // They cannot disprove a prior lost response; that remains unknown.
    if (result.error && /^(22|23|40|42|P0)[0-9A-Z]{3}$/.test(result.error.code ?? "")) {
      console.warn("[translation commit] transaction rejected", { jobId: request.p_job_id, code: result.error.code, ambiguous });
      if (!ambiguous) throw new Error("The manuscript, edition claim or review changed; no chapters were saved. Review the current edition before starting again.");
      break;
    }
    ambiguous = true;
  }
  throw new TranslationOutcomeUnknownError();
}
