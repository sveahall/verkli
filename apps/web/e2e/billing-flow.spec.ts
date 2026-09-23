import { test, expect } from "@playwright/test";

test.describe("billing & payment endpoints (mock mode)", () => {
  test("donation checkout API requires auth or mock mode", async ({ request }) => {
    const res = await request.post("/api/donations/checkout", {
      data: { amountMinor: 500, currency: "sek" },
    });

    // Mock mode → 200 with URL; real server without auth → 401
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body.url).toBe("string");
      expect(body.url).toContain("/donation/success");
    }
  });

  test("health endpoint responds with ok status", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBeLessThanOrEqual(500);
    const body = await res.json();
    // Unauthenticated → minimal response; admin auth → full { app, db, redis }
    expect(body.ok ?? body.app).toBeTruthy();
    expect(typeof body.timestamp).toBe("string");
  });

  test("billing state API requires auth", async ({ request }) => {
    const res = await request.get("/api/billing/state");
    // Should return 401 for unauthenticated requests
    expect([401, 403]).toContain(res.status());
  });

  test("reader membership page loads", async ({ page }) => {
    const res = await page.goto("/reader/membership", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("donation success page loads", async ({ page }) => {
    const res = await page.goto("/donation/success", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(
      page.getByRole("heading", { name: "Thank you for your donation" })
    ).toBeVisible();
  });

  test("donation cancel page loads", async ({ page }) => {
    const res = await page.goto("/donation/cancel", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    await expect(
      page.getByRole("heading", { name: "Donation canceled" })
    ).toBeVisible();
  });
});
