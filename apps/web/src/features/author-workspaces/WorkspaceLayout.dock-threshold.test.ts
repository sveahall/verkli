import { describe, expect, it } from "vitest";
import { DOCK_MIN_CONTENT_WIDTH, hasDockSpaceForContentWidth } from "./WorkspaceLayout";

/**
 * Regression for "the page does not move when I scroll".
 *
 * When the assistant does not dock it opens with showModal() and the layout
 * sets `body { overflow: hidden }`. Measured in a real browser, that takes the
 * page from scrolling 1000px to scrolling 0. Correct for a phone-sized sheet,
 * wrong for a laptop.
 *
 * The threshold used to be 1208 — an 820px canvas — which put the cutoff at a
 * maximised 1280px window. A browser one pixel narrower froze the page behind a
 * panel that still looked docked.
 *
 * The horizontal padding is 64px (px-4 / sm:px-6 / lg:px-8), so a content box of
 * N corresponds to a window of N + 64.
 */

const CONTENT_PADDING = 64;
const contentBoxFor = (windowWidth: number) => windowWidth - CONTENT_PADDING;

describe("assistant dock threshold", () => {
  it("docks on a 1072px window, the narrowest laptop we support", () => {
    expect(hasDockSpaceForContentWidth(contentBoxFor(1072))).toBe(true);
  });

  it("docks on a 1280px window that is not maximised", () => {
    // The reported bug. Fails at the old 1208 threshold.
    expect(hasDockSpaceForContentWidth(contentBoxFor(1280))).toBe(true);
    expect(hasDockSpaceForContentWidth(contentBoxFor(1200))).toBe(true);
  });

  it("docks on every common laptop width", () => {
    for (const width of [1280, 1366, 1440, 1512, 1728, 1920]) {
      expect(hasDockSpaceForContentWidth(contentBoxFor(width))).toBe(true);
    }
  });

  it("does not dock on tablet and phone widths, where the modal sheet is right", () => {
    for (const width of [390, 428, 768, 834]) {
      expect(hasDockSpaceForContentWidth(contentBoxFor(width))).toBe(false);
    }
  });

  it("leaves a writable canvas beside the 360px dock", () => {
    const DOCK = 360;
    const GAP = 28;
    expect(DOCK_MIN_CONTENT_WIDTH - DOCK - GAP).toBeGreaterThanOrEqual(600);
  });
});
