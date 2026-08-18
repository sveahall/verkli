import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEMS } from "./admin-nav";

describe("ADMIN_NAV_ITEMS", () => {
  it("exposes the feedback queue", () => {
    // `GET /api/admin/feedback` shipped with no UI consumer, so submitted
    // feedback landed in a table no admin could open.
    const feedback = ADMIN_NAV_ITEMS.find(
      (item) => item.href === "/admin/feedback"
    );

    expect(feedback).toBeDefined();
    expect(feedback?.label).toBe("Feedback");
  });

  it("has a unique href per entry", () => {
    const hrefs = ADMIN_NAV_ITEMS.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
