/**
 * Sanitize ai_jobs.error before persisting and before sending to clients.
 *
 * Never expose raw worker/provider errors directly. Map to controlled strings.
 */

const CONTROLLED_MAPPINGS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /^Queue unavailable/i, message: "Queue unavailable" },
  { pattern: /^Ownership mismatch/i, message: "Ownership mismatch" },
  { pattern: /^Book not found/i, message: "Book not found" },
  { pattern: /^No chapters found/i, message: "No chapters found" },
  { pattern: /^No version found/i, message: "No version found" },
  { pattern: /^Job kind mismatch/i, message: "Job kind mismatch" },
  { pattern: /^Unexpected job kind/i, message: "Job kind mismatch" },
  { pattern: /^Missing input\.text/i, message: "Missing TTS input text" },
  { pattern: /^Could not resolve public URL/i, message: "Failed to publish generated audio" },
  { pattern: /^Storage upload failed/i, message: "Storage upload failed" },
  { pattern: /^Audiobook feature is disabled/i, message: "Audiobook feature is disabled" },

  // Stuck-job copy used in UI (safe to preserve)
  {
    pattern: /^Uppgiften verkar ha fastnat/i,
    message: "Uppgiften verkar ha fastnat. Försök igen.",
  },

  // Supabase DB errors (normalized)
  { pattern: /^duplicate key value/i, message: "Duplicate job already exists" },
  { pattern: /^new row violates/i, message: "Database constraint violation" },
];

const FALLBACK_MESSAGE = "Något gick fel. Kontakta support om problemet kvarstår.";

function toControlledMessage(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, " ");
  for (const entry of CONTROLLED_MAPPINGS) {
    if (entry.pattern.test(normalized)) {
      return entry.message;
    }
  }
  return FALLBACK_MESSAGE;
}

/**
 * Use when writing `ai_jobs.error` to DB.
 */
export function sanitizeJobErrorForStorage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return toControlledMessage(raw);
}

/**
 * Use when reading `ai_jobs.error` for API responses.
 */
export function sanitizeJobError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return toControlledMessage(raw);
}
