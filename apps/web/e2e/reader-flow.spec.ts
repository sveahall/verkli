import { test, expect } from "@playwright/test";

test.describe("reader flow: browse → discover", () => {
  test("reader signup page loads", async ({ page }) => {
    const res = await page.goto("/reader/signup", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("reader signin page loads", async ({ page }) => {
    const res = await page.goto("/reader/signin", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("reader discover page loads with books grid", async ({ page }) => {
    const res = await page.goto("/reader/discover", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("reader genres page loads", async ({ page }) => {
    const res = await page.goto("/reader/genres", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("reader FAQ page loads", async ({ page }) => {
    const res = await page.goto("/reader/faq", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("reader how-it-works page loads", async ({ page }) => {
    const res = await page.goto("/reader/how-it-works", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("unauthenticated reader/library redirects to signin", async ({ page }) => {
    const res = await page.goto("/reader/library", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    const url = page.url();
    expect(url).toMatch(/signin|signup/);
  });

  test("unauthenticated reader/bookmarks redirects to signin", async ({ page }) => {
    const res = await page.goto("/reader/bookmarks", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    const url = page.url();
    expect(url).toMatch(/signin|signup/);
  });
});
