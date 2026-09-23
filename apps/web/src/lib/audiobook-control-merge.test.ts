import { describe, expect, it } from "vitest";
import { preserveAudiobookControlFlags } from "./audiobook-control-merge";

describe("preserveAudiobookControlFlags", () => {
  it("keeps a cancel that arrived after the worker decided to clear it", () => {
    const merged = preserveAudiobookControlFlags(
      { cancelRequested: true, cancelRequestedAt: "2026-09-22T12:00:00.000Z", controlState: "cancel_requested" },
      { completedChapters: 2, cancelRequested: false, pauseRequested: false, controlState: "running" },
    );

    expect(merged.cancelRequested).toBe(true);
    expect(merged.cancelRequestedAt).toBe("2026-09-22T12:00:00.000Z");
    expect(merged.controlState).toBe("cancel_requested");
    expect(merged.completedChapters).toBe(2);
  });

  it("lets a terminal cancelled write stay cancelled", () => {
    const merged = preserveAudiobookControlFlags(
      { cancelRequested: true, controlState: "cancel_requested" },
      { cancelRequested: false, controlState: "cancelled" },
    );

    expect(merged.cancelRequested).toBe(true);
    expect(merged.controlState).toBe("cancelled");
  });

  it("keeps a pause the worker's running patch would have cleared", () => {
    const merged = preserveAudiobookControlFlags(
      { pauseRequested: true, controlState: "pause_requested" },
      { pauseRequested: false, cancelRequested: false, controlState: "running" },
    );

    expect(merged.pauseRequested).toBe(true);
    expect(merged.controlState).toBe("pause_requested");
  });

  it("applies the worker patch when nobody has asked to pause or cancel", () => {
    const merged = preserveAudiobookControlFlags(
      { cancelRequested: false, pauseRequested: false, controlState: "running" },
      { completedChapters: 1, cancelRequested: false, controlState: "running" },
    );

    expect(merged).toMatchObject({ completedChapters: 1, cancelRequested: false, controlState: "running" });
  });
});