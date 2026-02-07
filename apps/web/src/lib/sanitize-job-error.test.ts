import { describe, expect, it } from "vitest";
import { sanitizeJobError, sanitizeJobErrorForStorage } from "./sanitize-job-error";

describe("sanitizeJobError", () => {
  it("maps provider/storage details to controlled message", () => {
    const raw = "Storage upload failed: permission denied for /tmp/private/secrets.log";
    expect(sanitizeJobError(raw)).toBe("Storage upload failed");
    expect(sanitizeJobErrorForStorage(raw)).toBe("Storage upload failed");
  });

  it("returns fallback for unknown raw errors", () => {
    const raw = "Error: boom\\n    at /usr/src/app/worker.ts:42:13";
    expect(sanitizeJobError(raw)).toBe("Något gick fel. Kontakta support om problemet kvarstår.");
  });

  it("returns null for empty input", () => {
    expect(sanitizeJobError(null)).toBeNull();
    expect(sanitizeJobError(undefined)).toBeNull();
    expect(sanitizeJobError("")).toBeNull();
  });
});
