/**
 * Idempotent job ID generation and processor-level deduplication helpers.
 *
 * - `makeJobId` creates a deterministic BullMQ job ID from domain keys.
 * - `isDuplicate` checks if work has already been completed (processor-side guard).
 */

import * as crypto from "crypto";

/**
 * Generate a deterministic job ID from a prefix and a set of domain keys.
 * Produces a stable, URL-safe string: `{prefix}:{sha256-short}`.
 *
 * @example makeJobId("import", orgId, fileHash) → "import:a1b2c3d4e5f6"
 */
export function makeJobId(prefix: string, ...keys: string[]): string {
  const input = keys.join("|");
  const hash = crypto.createHash("sha256").update(input, "utf8").digest("hex").slice(0, 12);
  return `${prefix}:${hash}`;
}

/**
 * Processor-level deduplication check.
 *
 * Generic helper that accepts a "check" function returning true if the work
 * has already been done (e.g., import already completed, translation already exists).
 *
 * @returns true if the job should be skipped (already processed).
 */
export async function isDuplicate(
  checkFn: () => Promise<boolean>,
  label?: string
): Promise<boolean> {
  try {
    const dup = await checkFn();
    if (dup && label) {
      console.log(`[idempotency] duplicate detected, skipping: ${label}`);
    }
    return dup;
  } catch (err) {
    // If the check itself fails, do NOT skip — let the job proceed.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[idempotency] dedupe check failed (proceeding): ${msg}`);
    return false;
  }
}
