import { test, expect } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import * as path from "node:path";

// Pull SUPABASE_URL / anon key out of apps/web/.env.local — Playwright's
// own runner doesn't inherit the webServer.env block.
loadDotenv({ path: path.resolve(__dirname, "..", ".env.local") });

/**
 * Investor-pitch demo flow E2E. Signs in as the seeded demo author and
 * walks through the four pitch surfaces (Cover · Production · Distribute ·
 * Reader-finalen), capturing a screenshot of each so the design pass can
 * be reviewed off the test artifacts.
 *
 * Skipped automatically if NEXT_PUBLIC_DEMO_FACADE_ENABLED isn't on, since
 * the entire flow is gated on that flag.
 */

const DEMO_EMAIL = "demo-author@verkli.local";
const DEMO_PASSWORD = "VerkliDemo!2026";
const DEMO_BOOK_ID = "6abdd304-7bc3-41a1-a841-4bf764621ac3";

test.describe("Demo pitch flow — visual e2e", () => {
  // Reader-finalen is public — no auth needed. Author surfaces require the
  // demo session; we bypass the form by hitting Supabase's REST auth
  // directly and injecting the resulting cookies into the Playwright
  // context. Faster + more reliable than driving the signin form.
  test.beforeEach(async ({ page, context }) => {
    test.setTimeout(180_000);
    const isReaderTest = test.info().title.includes("reader-finalen");
    if (isReaderTest) return;

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    if (!supabaseUrl || !anonKey) {
      test.skip(true, "SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set");
      return;
    }
    const tokenRes = await page.request.post(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        headers: {
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      }
    );
    if (!tokenRes.ok()) {
      const body = await tokenRes.text();
      throw new Error(`Demo signin failed: ${tokenRes.status()} ${body.slice(0, 200)}`);
    }
    const session = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at?: number;
      expires_in?: number;
      token_type?: string;
      user?: unknown;
    };
    // Supabase ssr stores the auth payload as a JSON cookie keyed off the
    // project ref. Match the same name @supabase/ssr writes server-side.
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const expiresAt =
      session.expires_at ??
      Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
    const cookieValue = `base64-${Buffer.from(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: expiresAt,
        expires_in: session.expires_in ?? 3600,
        token_type: session.token_type ?? "bearer",
        user: session.user,
      })
    ).toString("base64url")}`;
    await context.addCookies([
      {
        name: `sb-${projectRef}-auth-token`,
        value: cookieValue,
        url: "http://localhost:3000",
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "active_role",
        value: "author",
        url: "http://localhost:3000",
        sameSite: "Lax",
      },
    ]);
  });

  test("workspace cover panel renders one-click demo view", async ({ page }) => {
    await page.goto(`/author/books/${DEMO_BOOK_ID}?panel=cover`, {
      waitUntil: "domcontentloaded",
    });
    // Demo CTA exists.
    const cta = page.getByRole("button", { name: /Generate cover/i });
    await expect(cta).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: "test-results/demo-cover.png",
      fullPage: false,
    });
  });

  test("production panel runs the 18 s pacing", async ({ page }) => {
    await page.goto(`/author/books/${DEMO_BOOK_ID}?panel=production`, {
      waitUntil: "domcontentloaded",
    });
    const cta = page.getByRole("button", { name: /Produce everything/i });
    await expect(cta).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: "test-results/demo-production-idle.png",
      fullPage: false,
    });
    await cta.click();
    // Wait for the "languages ready" terminal state — pacing schedule is
    // 17 500 ms total, plus a bit of slack for animation/render.
    const productionRegion = page.getByRole("region", {
      name: /Demo production façade/i,
    });
    await expect(productionRegion.getByLabel("all done")).toBeVisible({
      timeout: 25_000,
    });
    await expect(productionRegion.getByText("languages ready")).toBeVisible();
    await page.screenshot({
      path: "test-results/demo-production-done.png",
      fullPage: false,
    });
  });

  test("distribute panel launches 12 posts", async ({ page }) => {
    await page.goto(`/author/books/${DEMO_BOOK_ID}?panel=distribute`, {
      waitUntil: "domcontentloaded",
    });
    const cta = page.getByRole("button", { name: /Launch globally/i });
    await expect(cta).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: "test-results/demo-distribute-idle.png",
      fullPage: false,
    });
    await cta.click();
    await expect(page.getByText("12 live posts")).toBeVisible({
      timeout: 25_000,
    });
    await page.screenshot({
      path: "test-results/demo-distribute-done.png",
      fullPage: false,
    });
  });

  test("reader-finalen renders cover + language switcher + audio bar", async ({ page }) => {
    await page.goto(`/reader/books/${DEMO_BOOK_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/Available in 10 languages/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Audiobook in/i)).toBeVisible();
    await page.screenshot({
      path: "test-results/demo-reader.png",
      fullPage: false,
    });
  });
});
