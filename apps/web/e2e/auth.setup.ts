import { test as setup, expect } from "@playwright/test";
import path from "node:path";

/**
 * Signs in once as the E2E fixture author and saves the session to disk. Every
 * authenticated spec reuses it, so the login form is exercised here and only
 * here — one place to fix when it changes, and no per-test login cost.
 *
 * Run `npm run e2e:fixture` first; it creates the account this signs in as.
 *
 * Skips rather than fails when the credentials are absent. A contributor
 * without them should still be able to run the unauthenticated suite, and a
 * red test that means "you have no password" teaches people to ignore red.
 */

export const AUTH_STATE = path.join(__dirname, ".auth", "author.json");

setup("authenticate as the E2E author", async ({ page }) => {
  const email = process.env.E2E_AUTHOR_EMAIL;
  const password = process.env.E2E_AUTHOR_PASSWORD;

  setup.skip(
    !email || !password,
    "E2E_AUTHOR_EMAIL / E2E_AUTHOR_PASSWORD not set — run npm run e2e:fixture"
  );

  await page.goto("/author/signin");

  // Selecting by input type, not by label: the signin inputs carry no `id`
  // and no `htmlFor`, so getByLabel finds nothing. That is an accessibility
  // gap worth its own fix; here it just dictates the selector.
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // The redirect target has moved before (library vs home), so assert on
  // leaving the signin page rather than on arriving somewhere specific.
  await expect(page).not.toHaveURL(/\/author\/signin/, { timeout: 30_000 });

  // Landing somewhere is not the same as being authenticated — a failed login
  // can bounce to a page that renders. Ask an endpoint that requires the
  // author role, so a saved state is never a signed-out one.
  const response = await page.request.get("/api/author/stats");
  expect(
    response.status(),
    "signed in but /api/author/stats did not accept the session"
  ).toBe(200);

  await page.context().storageState({ path: AUTH_STATE });
});
