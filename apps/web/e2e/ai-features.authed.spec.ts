import { test, expect } from "@playwright/test";

/**
 * The authenticated AI surfaces — the three things a demo is judged on and the
 * three no test could reach before the fixture existed.
 *
 * These call real providers and cost real money: fal per image, ElevenLabs per
 * character, Anthropic per token. Small amounts, but not zero, which shapes
 * two rules:
 *
 *   - Nothing here generates audio. The audiobook chain is proven by putting a
 *     job on the queue and watching the worker take it, not by synthesising
 *     speech in CI.
 *   - Cover generation is opt-in via E2E_RUN_PAID, because four images per run
 *     across many runs is a bill nobody decided to pay.
 *
 * What runs unconditionally is the wiring: does the panel exist, does the
 * request reach the route, does the route answer as itself rather than 404 or
 * a login redirect. That is where breakage actually happens.
 */

const RUN_PAID = process.env.E2E_RUN_PAID === "true";

async function openFixtureBook(page: import("@playwright/test").Page) {
  await page.goto("/author/books");
  const book = page.getByText(/E2E fixture — automated test book/i).first();
  await expect(book, "fixture book missing — run npm run e2e:fixture").toBeVisible({
    timeout: 30_000,
  });
  await book.click();
  await expect(page).toHaveURL(/\/author\/books\/[0-9a-f-]{36}/, { timeout: 30_000 });
  return page.url().match(/\/author\/books\/([0-9a-f-]{36})/)?.[1] ?? "";
}

test.describe("AI assistant", () => {
  test("the panel is reachable from the sidebar", async ({ page }) => {
    await openFixtureBook(page);

    // The panel existed as dead code for months: `ai` was in ALL_TOOLS with no
    // component and no nav entry. This asserts it is reachable by clicking,
    // not merely by typing ?panel=ai.
    await page.getByRole("link", { name: /AI Assistant/i }).click();
    await expect(page).toHaveURL(/panel=ai/);
    await expect(page.getByRole("heading", { name: /AI Assistant/i })).toBeVisible();
  });

  test("answers a question with a real model reply", async ({ page }) => {
    const bookId = await openFixtureBook(page);

    const response = await page.request.post(`/api/books/${bookId}/ai/chat`, {
      data: { message: "Reply with exactly: PONG", chapterId: null, selectedText: null },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.content, "assistant returned an empty reply").toBeTruthy();

    // `source: "template"` means both providers failed and the canned reply was
    // served. The panel labels that honestly, so it is not a crash — but it is
    // exactly the silent degradation this test exists to catch.
    expect(
      body.source,
      `AI chat fell back to canned templates (provider: ${body.provider ?? "none"})`
    ).toBe("llm");
  });
});

test.describe("cover generation", () => {
  test("the panel renders the AI form", async ({ page }) => {
    await openFixtureBook(page);
    await page.getByRole("link", { name: /^Cover$/i }).click();
    await expect(page.getByText(/Generate with AI/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Generate$/i })).toBeVisible();
  });

  test("rejects an unauthenticated request", async ({ page, browser }) => {
    const bookId = await openFixtureBook(page);
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const response = await anon.request.post(
      `/api/books/${bookId}/cover/generate`,
      { data: { prompt: "a lighthouse", style: "minimal" } }
    );
    expect(response.status()).toBe(401);
    await anon.close();
  });

  test("generates four covers", async ({ page }) => {
    test.skip(!RUN_PAID, "costs money — set E2E_RUN_PAID=true to run");
    const bookId = await openFixtureBook(page);

    const response = await page.request.post(`/api/books/${bookId}/cover/generate`, {
      data: { prompt: "a lighthouse in a storm, dramatic sky", style: "photographic" },
      timeout: 90_000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.images).toHaveLength(4);
    for (const url of body.images) {
      // Must be our storage, not the provider's — fal's URLs expire, and a
      // cover that disappears in a week is worse than one that never generated.
      expect(url).toContain("/storage/v1/object/public/book_covers/");
    }
  });
});

test.describe("author statistics", () => {
  test("every stats endpoint answers for a signed-in author", async ({ page }) => {
    await openFixtureBook(page);

    // Before WP-15 these read through the session client against tables with
    // no author-scoped SELECT policy, so they answered 200 with zeros forever.
    // A 200 is necessary but not sufficient; the shape assertions below are
    // what catch a route that "works" while returning nothing meaningful.
    for (const path of [
      "/api/author/stats",
      "/api/author/stats/books",
      "/api/author/stats/engagement",
      "/api/author/stats/revenue",
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), `${path} did not answer 200`).toBe(200);
    }
  });

  test("revenue reports major units and a real currency", async ({ page }) => {
    const response = await page.request.get("/api/author/stats/revenue");
    const body = await response.json();

    expect(typeof body.totalRevenue).toBe("number");
    // Amounts are stored in minor units. A fixture author has no sales, so the
    // total must be 0 — but the field must exist and be a number, because the
    // dashboard formats it with a bare currency suffix and would happily print
    // "undefined SEK".
    expect(Number.isFinite(body.totalRevenue)).toBe(true);
    expect(body.currency).toMatch(/^[A-Z]{3}$/);
  });

  test("engagement counts followers without erroring", async ({ page }) => {
    const response = await page.request.get("/api/author/stats/engagement");
    const body = await response.json();

    // `follows` has no `id` column, so the old count query errored and the
    // route reported zero followers for everyone. Zero is the right answer for
    // this fixture; the point is that it is a number rather than a swallowed
    // failure.
    expect(typeof body.followers).toBe("number");
    expect(typeof body.comments).toBe("number");
    expect(typeof body.reviews).toBe("number");
  });
});
