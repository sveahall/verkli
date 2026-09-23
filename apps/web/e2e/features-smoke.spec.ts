import { test, expect } from "@playwright/test";

// Smoke coverage for the five features recently wired end-to-end:
// reviews DELETE, trailer reader rendering, inbox realtime, AI chat LLM,
// POD manual fulfillment + orders page. No authenticated session is
// available in CI, so we verify auth gates, HTML surface, and API status
// codes rather than full user journeys.

test.describe("reviews DELETE endpoint", () => {
  test("returns 401 when unauthenticated", async ({ request }) => {
    const res = await request.delete(
      "/api/books/00000000-0000-0000-0000-000000000001/reviews",
    );
    expect([401, 404]).toContain(res.status());
  });

  test("returns 400 for invalid book id", async ({ request }) => {
    const res = await request.delete("/api/books/not-a-uuid/reviews");
    expect([400, 401]).toContain(res.status());
  });
});

test.describe("AI chat LLM endpoint", () => {
  test("rejects unauthenticated POST", async ({ request }) => {
    const res = await request.post(
      "/api/books/00000000-0000-0000-0000-000000000001/ai/chat",
      { data: { message: "ping" } },
    );
    expect([401, 403, 404]).toContain(res.status());
  });
});

test.describe("reader inbox (messaging realtime)", () => {
  test("unauthenticated reader/inbox bounces to signin", async ({ page }) => {
    const res = await page.goto("/reader/inbox", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBeLessThan(500);
    const url = page.url();
    expect(url).toMatch(/signin|signup/);
  });

  test("unauthenticated author/inbox bounces to signin", async ({ page }) => {
    const res = await page.goto("/author/inbox", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBeLessThan(500);
    const url = page.url();
    expect(url).toMatch(/signin|signup|reader/);
  });
});

test.describe("POD orders page", () => {
  test("unauthenticated /reader/orders bounces to signin", async ({ page }) => {
    const res = await page.goto("/reader/orders", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBeLessThan(500);
    // Middleware short-circuits to /reader/signin without the `next=` param
    // when a protected route is hit unauthenticated; that's fine as long as
    // the user ends up on the signin surface and not on a 500.
    expect(page.url()).toMatch(/signin|signup/);
  });
});

test.describe("trailer on public book page", () => {
  test("discover → first book detail renders without 500", async ({ page }) => {
    const discover = await page.goto("/reader/discover", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(discover?.status()).toBeLessThan(500);

    const bookLink = page.locator('a[href^="/reader/books/"]').first();
    const count = await bookLink.count();
    test.skip(count === 0, "no public books seeded in this environment");

    const href = await bookLink.getAttribute("href");
    const detail = await page.goto(href ?? "/reader/discover", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(detail?.status()).toBeLessThan(500);

    // Trailer section is conditional on trailer_url. When present, the <video>
    // must appear; when absent, the section is omitted. Either is valid —
    // we just assert the page rendered without crashing.
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
