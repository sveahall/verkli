/**
 * Sanitize ai_jobs.error before persisting and before sending to clients.
 *
 * Never expose raw worker/provider errors directly. Map to controlled strings.
 */

const CONTROLLED_MAPPINGS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /^Queue unavailable/i, message: "Kön är tillfälligt otillgänglig. Försök igen senare." },
  { pattern: /^Ownership mismatch/i, message: "Du har inte behörighet för detta jobb." },
  { pattern: /^Book not found/i, message: "Boken hittades inte." },
  { pattern: /^No chapters found/i, message: "Boken har inga kapitel att bearbeta." },
  { pattern: /^No version found/i, message: "Ingen giltig version hittades för jobbet." },
  { pattern: /^Job kind mismatch/i, message: "Ogiltig jobbtyp." },
  { pattern: /^Unexpected job kind/i, message: "Ogiltig jobbtyp." },
  { pattern: /^Missing input\.text/i, message: "Text saknas för talsyntes." },
  { pattern: /^Could not resolve public URL/i, message: "Kunde inte publicera genererat ljud." },
  { pattern: /^Storage upload failed/i, message: "Kunde inte spara resultatfilen." },
  { pattern: /object exceeded the maximum allowed size/i, message: "Ljudfilen är för stor att ladda upp." },
  { pattern: /^Failed to stitch chapter audio chunks/i, message: "Kunde inte slå ihop ljudsegment." },
  { pattern: /^Text is too long \(max \d+ characters\)/i, message: "Ett kapitel är för långt för talsyntes." },
  { pattern: /^Audiobook feature is disabled/i, message: "Ljudboksfunktionen är inaktiverad." },

  // Worker utility errors
  { pattern: /Budget exceeded/i, message: "Dagskvoten är nådd. Försök igen imorgon." },
  { pattern: /timed out after/i, message: "Bearbetningen tog för lång tid. Försök igen." },

  // Stuck-job copy used in UI (safe to preserve)
  {
    pattern: /^Uppgiften verkar ha fastnat/i,
    message: "Uppgiften verkar ha fastnat. Försök igen.",
  },

  // Social publish errors
  { pattern: /^Social publish failed/i, message: "Publicering till sociala medier misslyckades." },
  { pattern: /^Platform not connected/i, message: "Den här plattformen är inte ansluten." },
  { pattern: /^Token expired/i, message: "Anslutningen har gått ut. Anslut igen." },
  { pattern: /^Publish not implemented/i, message: "Publicering stöds ännu inte för den här plattformen." },

  // Supabase DB errors (normalized)
  { pattern: /^duplicate key value/i, message: "Ett liknande jobb finns redan." },
  { pattern: /^new row violates/i, message: "Datavalidering misslyckades." },

  // TTS Preview
  { pattern: /^USER_CANCELLED$/i, message: "Jobbet avbröts." },
  { pattern: /^WORKER_STALE$/i, message: "Jobbet avbröts (timeout). Försök igen." },
  { pattern: /^Qwen synth timed out/i, message: "Talsyntesen tog för lång tid. Försök igen." },
  { pattern: /^Qwen synth exited/i, message: "Talsyntesen misslyckades. Försök igen." },
  { pattern: /^Failed to start Qwen synth/i, message: "Kunde inte starta talsyntesmotor." },
  { pattern: /^Storage upload failed/i, message: "Kunde inte spara ljudfilen." },
];

const FALLBACK_MESSAGE = "Något gick fel under bearbetningen. Försök igen.";
const CONTROLLED_MESSAGES = new Map(
  CONTROLLED_MAPPINGS.map((entry) => [entry.message.toLowerCase(), entry.message])
);

function toControlledMessage(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, " ");
  const alreadyControlled = CONTROLLED_MESSAGES.get(normalized.toLowerCase());
  if (alreadyControlled) {
    return alreadyControlled;
  }
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

/**
 * Resolve the best available user-safe error message.
 * Prefer primary unless it collapses to fallback; then use secondary.
 */
export function resolveSanitizedJobError(
  primary: string | null | undefined,
  secondary: string | null | undefined
): string | null {
  const first = sanitizeJobError(primary);
  if (first && first !== FALLBACK_MESSAGE) {
    return first;
  }
  const next = sanitizeJobError(secondary);
  return next ?? first;
}
