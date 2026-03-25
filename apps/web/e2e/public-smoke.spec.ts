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
    await expect(page.getByRole("heading", { name: "Find your next read" })).toBeVisible();
  });

  test("/donation success + cancel pages load", async ({ page }) => {
    const successRes = await page.goto("/donation/success", { waitUntil: "domcontentloaded" });
    expect(successRes?.status()).toBeLessThan(500);
    await expect(page.getByRole("heading", { name: "Thank you for your donation" })).toBeVisible();

    const cancelRes = await page.goto("/donation/cancel", { waitUntil: "domcontentloaded" });
    expect(cancelRes?.status()).toBeLessThan(500);
    await expect(page.getByRole("heading", { name: "Donation canceled" })).toBeVisible();
  });

  test("donation checkout API returns mock checkout URL", async ({ request }) => {
    const res = await request.post("/api/donations/checkout", {
      data: { amountMinor: 100, currency: "sek" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain("/donation/success");
  });
});
