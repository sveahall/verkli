import { describe, expect, it } from "vitest";
import { NAV_CONFIG } from "./navConfig";

describe("NAV_CONFIG reader variants", () => {
  it.each(["PUBLIC_READER", "APP_READER"] as const)(
    "exposes a support link in %s",
    (variant) => {
      const hrefs = NAV_CONFIG[variant].links.map((link) => link.href);

      expect(hrefs).toContain("/support");
    }
  );
});
