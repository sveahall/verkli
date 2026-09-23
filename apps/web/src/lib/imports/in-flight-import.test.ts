import { describe, expect, it } from "vitest";
import { selectInFlightImport } from "./in-flight-import";

const now = Date.parse("2026-09-22T16:00:00.000Z");

describe("selectInFlightImport", () => {
  it("returns the newest import that is still running", () => {
    const chosen = selectInFlightImport(
      [
        { id: "old", status: "pending", updated_at: "2026-09-22T15:50:00.000Z" },
        { id: "new", status: "extracting", updated_at: "2026-09-22T15:55:00.000Z" },
        { id: "done", status: "completed", updated_at: "2026-09-22T15:59:00.000Z" },
      ],
      now,
    );
    expect(chosen?.id).toBe("new");
  });

  it("ignores a run that has not updated for 15 minutes", () => {
    const chosen = selectInFlightImport(
      [{ id: "stuck", status: "extracting", updated_at: "2026-09-22T15:40:00.000Z" }],
      now,
    );
    expect(chosen).toBeNull();
  });
});