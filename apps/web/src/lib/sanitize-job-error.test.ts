import { describe, expect, it } from "vitest";
import { resolveSanitizedJobError, sanitizeJobError, sanitizeJobErrorForStorage } from "./sanitize-job-error";

describe("sanitizeJobError", () => {
  it("maps provider/storage details to controlled message", () => {
    const raw = "Storage upload failed: permission denied for /tmp/private/secrets.log";
    expect(sanitizeJobError(raw)).toBe("Kunde inte spara resultatfilen.");
    expect(sanitizeJobErrorForStorage(raw)).toBe("Kunde inte spara resultatfilen.");
  });

  it("returns fallback for unknown raw errors", () => {
    const raw = "Error: boom\\n    at /usr/src/app/worker.ts:42:13";
    expect(sanitizeJobError(raw)).toBe("Något gick fel under bearbetningen. Försök igen.");
  });

  it("preserves already-controlled messages (avoids double-sanitize fallback)", () => {
    const controlled = "Dagskvoten är nådd. Försök igen imorgon.";
    expect(sanitizeJobError(controlled)).toBe(controlled);
    expect(sanitizeJobErrorForStorage(controlled)).toBe(controlled);
  });

  it("maps long-text synthesis errors to a user-safe message", () => {
    const raw = "Text is too long (max 1000 characters)";
    expect(sanitizeJobError(raw)).toBe("Ett kapitel är för långt för talsyntes.");
  });

  it("prefers secondary message when primary collapses to fallback", () => {
    const resolved = resolveSanitizedJobError(
      "Error: boom\\n    at /usr/src/app/worker.ts:42:13",
      "Budget exceeded for \"user\": daily usage 123 >= limit 100"
    );
    expect(resolved).toBe("Dagskvoten är nådd. Försök igen imorgon.");
  });

  it("returns null for empty input", () => {
    expect(sanitizeJobError(null)).toBeNull();
    expect(sanitizeJobError(undefined)).toBeNull();
    expect(sanitizeJobError("")).toBeNull();
  });
});
