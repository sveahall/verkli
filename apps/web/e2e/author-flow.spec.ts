import { test, expect } from "@playwright/test";

test.describe("author flow: signup → pages load", () => {
  test("author signup page loads", async ({ page }) => {
    const res = await page.goto("/author/signup", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("author signin page loads", async ({ page }) => {
    const res = await page.goto("/author/signin", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("unauthenticated author/home redirects to signin", async ({ page }) => {
    const res = await page.goto("/author/home", { waitUntil: "domcontentloaded" });
    // Should redirect to signin or show auth page
    expect(res?.status()).toBeLessThan(500);
    const url = page.url();
    expect(url).toMatch(/signin|signup|reader/);
  });

  test("author books page requires auth", async ({ page }) => {
    const res = await page.goto("/author/books", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    const url = page.url();
    expect(url).toMatch(/signin|signup|reader/);
  });

  test("author stats page requires auth", async ({ page }) => {
    const res = await page.goto("/author/stats", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    const url = page.url();
    expect(url).toMatch(/signin|signup|reader/);
  });
});
