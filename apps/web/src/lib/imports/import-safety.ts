/** Temporary boundary until draft replacement has an atomic database commit. */
export const IMPORT_OVERWRITE_ERROR = "IMPORT_OVERWRITE_UNAVAILABLE";
export const IMPORT_OVERWRITE_MESSAGE = "Replacing an existing draft is temporarily unavailable to protect your manuscript. Import a separate copy instead.";

export function requestsDraftOverwrite(mode: unknown, legacyOverwrite?: unknown): boolean {
  return (typeof mode === "string" && mode.trim().toLowerCase() === "overwrite_draft")
    || legacyOverwrite === true || legacyOverwrite === "true" || legacyOverwrite === "1";
}
