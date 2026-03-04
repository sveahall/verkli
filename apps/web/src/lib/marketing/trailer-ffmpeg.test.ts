import { describe, expect, it } from "vitest";
import { FFMPEG_CONCAT_OUTPUT_OPTIONS } from "./trailer-ffmpeg-options";

describe("trailer ffmpeg output options", () => {
  it("keeps audio when stitching scene videos", () => {
    expect(FFMPEG_CONCAT_OUTPUT_OPTIONS).toContain("-c:a aac");
    expect(FFMPEG_CONCAT_OUTPUT_OPTIONS).not.toContain("-an");
  });
});
