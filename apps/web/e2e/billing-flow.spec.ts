import { test, expect } from "@playwright/test";

test.describe("billing & payment endpoints (mock mode)", () => {
  test("donation checkout API returns mock URL", async ({ request }) => {
    const res = await request.post("/api/donations/checkout", {
      data: { amountMinor: 500, currency: "sek" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain("/donation/success");
  });

  test("health endpoint returns app + db + redis status", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBeLessThanOrEqual(500); // May be 500 if no Redis in CI
    const body = await res.json();
    expect(typeof body.app).toBe("boolean");
    expect(typeof body.db).toBe("boolean");
    expect(typeof body.redis).toBe("boolean");
    expect(body.app).toBe(true);
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
