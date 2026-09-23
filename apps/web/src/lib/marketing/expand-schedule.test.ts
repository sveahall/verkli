import { describe, expect, it } from "vitest";
import { expandSchedule } from "./expand-schedule";

describe("expandSchedule", () => {
  it("expands plan into one post per scheduled day × channel × language × content_type", () => {
    const posts = expandSchedule({
      startDate: "2026-05-04", // Monday
      durationWeeks: 1,
      weeklySchedule: {
        mon: ["instagram", "tiktok"],
        wed: ["x"],
      },
      languages: ["en", "sv"],
      contentTypes: ["text", "trailer"],
      template: "launch",
    });

    // 3 days × 2 langs × 2 content types = 12
    expect(posts.length).toBe(12);

    const monPosts = posts.filter(
      (p) => p.scheduledFor.getUTCDay() === 1
    );
    expect(monPosts.length).toBe(8); // 2 channels × 2 langs × 2 types
  });

  it("returns empty when start date invalid", () => {
    const posts = expandSchedule({
      startDate: "not-a-date",
      durationWeeks: 1,
      weeklySchedule: { mon: ["x"] },
      languages: ["en"],
      contentTypes: ["text"],
      template: "launch",
    });
    expect(posts).toHaveLength(0);
  });

  it("ignores unknown channels", () => {
    const posts = expandSchedule({
      startDate: "2026-05-04",
      durationWeeks: 1,
      weeklySchedule: { mon: ["instagram", "linkedin" as never] },
      languages: ["en"],
      contentTypes: ["text"],
      template: "launch",
    });
    expect(posts).toHaveLength(1);
    expect(posts[0].channel).toBe("instagram");
  });

  it("rotates variantIndex globally across the run", () => {
    const posts = expandSchedule({
      startDate: "2026-05-04",
      durationWeeks: 1,
      weeklySchedule: { mon: ["x"], tue: ["x"] },
      languages: ["en"],
      contentTypes: ["text"],
      template: "launch",
    });
    expect(posts.map((p) => p.variantIndex)).toEqual([0, 1]);
  });
});
