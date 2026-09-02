import { describe, expect, it } from "vitest";
import {
  FAL_DOWNLOAD_TIMEOUT_MS,
  FAL_STORAGE_HEADROOM_MS,
  FAL_TIMEOUT_MS,
} from "./fal-image";
import { maxDuration } from "@/app/api/books/[id]/cover/generate/route";

/**
 * The bug this exists for: fal was capped at 40s and each download at 20s, on a
 * 60s function limit. The two bounded phases alone consumed the entire budget,
 * so the four storage uploads afterwards had nothing left and the platform
 * killed the function mid-flight. The author saw a spinner and then a generic
 * error; the real cause appeared only in Vercel's log as a runtime timeout.
 *
 * Both files carried comments asserting the timeouts were "comfortably inside
 * the platform limit". Comments cannot add. This can.
 */
describe("cover generation time budget", () => {
  it("leaves room for the uploads it does not time out", () => {
    const bounded = FAL_TIMEOUT_MS + FAL_DOWNLOAD_TIMEOUT_MS;
    const total = bounded + FAL_STORAGE_HEADROOM_MS;

    expect(total).toBeLessThanOrEqual(maxDuration * 1000);
  });

  it("keeps the provider timeout the largest single phase", () => {
    // Generation is the slow part; if a download were allowed to outlast it the
    // budget would be describing the wrong bottleneck.
    expect(FAL_TIMEOUT_MS).toBeGreaterThan(FAL_DOWNLOAD_TIMEOUT_MS);
  });
});
