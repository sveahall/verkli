import { describe, it, expect } from "vitest";
import { shouldRunNow } from "./scheduler";

const at = (iso: string) => new Date(iso);
const HOUR = 3; // 03:00 UTC

describe("shouldRunNow", () => {
  it("runs once the scheduled hour has passed and nothing ran today", () => {
    expect(shouldRunNow(at("2026-09-21T03:30:00Z"), at("2026-09-22T03:05:00Z"), HOUR)).toBe(true);
  });

  it("does not run before the scheduled hour", () => {
    expect(shouldRunNow(at("2026-09-21T03:30:00Z"), at("2026-09-22T02:59:00Z"), HOUR)).toBe(false);
  });

  it("does not run twice in one day", () => {
    // The tick fires every 15 minutes; only the first one past the hour works.
    expect(shouldRunNow(at("2026-09-22T03:05:00Z"), at("2026-09-22T03:20:00Z"), HOUR)).toBe(false);
  });

  it("still runs after a restart that skipped the scheduled hour", () => {
    // Container was down 02:00-06:00. A naive "is it 03:00 now?" check would
    // silently skip the day; this catches up instead.
    expect(shouldRunNow(at("2026-09-21T03:05:00Z"), at("2026-09-22T06:00:00Z"), HOUR)).toBe(true);
  });

  it("runs on first boot when nothing has ever run", () => {
    expect(shouldRunNow(null, at("2026-09-22T03:05:00Z"), HOUR)).toBe(true);
  });

  it("waits for the hour on first boot rather than firing immediately", () => {
    // Otherwise every deploy triggers a full storage walk.
    expect(shouldRunNow(null, at("2026-09-22T01:00:00Z"), HOUR)).toBe(false);
  });

  it("treats a run from earlier today but before the hour as not yet done", () => {
    // A manual `npm run usage:storage` at 01:00 must not cancel the 03:00 run.
    expect(shouldRunNow(at("2026-09-22T01:00:00Z"), at("2026-09-22T03:05:00Z"), HOUR)).toBe(true);
  });
});
