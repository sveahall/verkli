import { test, expect } from "@playwright/test";

test.describe("public pages load without auth", () => {
  test("/ loads and renders content", async ({ page }) => {
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("/reader/discover loads and renders content", async ({ page }) => {
    const res = await page.goto("/reader/discover", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
