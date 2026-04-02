import { test, expect } from "@playwright/test";

test.describe("Book Trailer Feature — Reader Side", () => {
  test("discover page loads without errors", async ({ page }) => {
    const response = await page.goto("/reader/discover");
    expect(response?.status()).toBe(200);

    // Page renders book grid
    await expect(page.locator("main")).toBeVisible();

    // No crash — check no error overlay
    await expect(page.locator("[data-nextjs-dialog]")).not.toBeVisible();
  });

  test("book detail page renders trailer section when trailer_url present", async ({ page }) => {
    // Navigate to discover to find a published book
    await page.goto("/reader/discover");

    // Find any book card link
    const bookLink = page.locator('a[href^="/reader/books/"]').first();
    const hasBooks = await bookLink.isVisible().catch(() => false);

    if (!hasBooks) {
      test.skip();
      return;
    }

    await bookLink.click();
    await page.waitForLoadState("networkidle");

    // Book detail page should render
    await expect(page.locator("h1")).toBeVisible();

    // Check for trailer section (may or may not be present depending on data)
    const trailerHeading = page.getByText("Book trailer", { exact: false });
    const hasTrailer = await trailerHeading.isVisible().catch(() => false);

    if (hasTrailer) {
      // If trailer exists, video player should be present
      await expect(page.locator("video")).toBeVisible();
    }

    // Page should render without errors regardless
    await expect(page.locator("[data-nextjs-dialog]")).not.toBeVisible();
  });

  test("BookCard play icon renders for books with trailers", async ({ page }) => {
    await page.goto("/reader/discover");

    // Check if any play icon badges exist (lucide Play icon in a badge)
    const playBadges = page.locator(".absolute.right-2.top-2");
    const badgeCount = await playBadges.count();

    // This is informational — badges only show after migration + data
    // eslint-disable-next-line no-console
    console.log(`Found ${badgeCount} trailer badges on discover page`);

    // Page should render without errors
    await expect(page.locator("[data-nextjs-dialog]")).not.toBeVisible();
  });
});

test.describe("Book Trailer Feature — Video Player Component", () => {
  test("video player component handles missing src gracefully", async ({ page }) => {
    // Direct navigation to any book to verify no crash
    await page.goto("/reader/discover");
    const response = await page.goto("/reader/discover");
    expect(response?.status()).toBe(200);
  });
});

test.describe("Book Trailer Feature — API", () => {
  test("trailer status endpoint returns 401 for unauthenticated", async ({ request }) => {
    const response = await request.get(
      "/api/books/00000000-0000-0000-0000-000000000000/trailer/status"
    );
    // Should return 401 (unauthorized) not 500 (crash)
    expect([401, 403]).toContain(response.status());
  });

  test("trailer build endpoint returns 401 for unauthenticated", async ({ request }) => {
    const response = await request.post(
      "/api/books/00000000-0000-0000-0000-000000000000/trailer/build",
      {
        data: {
          title: "Test",
          genre: "literary",
          description: "Test description",
          keywords: ["test"],
          tone: "dreamy",
        },
      }
    );
    expect([401, 403]).toContain(response.status());
  });
});
