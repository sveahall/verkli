import { expect, test } from "@playwright/test";

// Exercises the real UI using deterministic API responses. No paid providers,
// author data, social account or production database is used by this test.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/notifications**", route => route.fulfill({ json: { notifications: [], unreadCount: 0 } }));
});

test("draft book → brief → generated copy → edit → save → reopen, including budget", async ({ page }, testInfo) => {
  const assets: Record<string, unknown>[] = [];
  let failSave = false;
  await page.route("**/api/marketing/assets**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { assets } });
    if (failSave) return route.fulfill({ status: 503, json: { error: "DATABASE_ERROR" } });
    const body = route.request().postDataJSON();
    const asset = { ...body, id: String(assets.length + 1), created_at: "2026-09-24T12:00:00Z" };
    assets.unshift(asset);
    return route.fulfill({ json: asset });
  });
  await page.route("**/api/books/*/marketing/generate", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ channel: "facebook", draftOnly: true, brief: { goal: "Spark curiosity", audience: "Readers of gentle adventures" } });
    return route.fulfill({ json: { headline: "The Paper Boat", caption: "A small boat. A river full of stories.", cta: "What would you discover?", hashtags: "#Books" } });
  });
  await page.goto("/dev/marketing-studio");
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
  await page.getByLabel("Marketing goal").selectOption("Spark curiosity");
  await page.getByLabel("Draft channel").selectOption("facebook");
  await page.getByLabel("Intended audience").fill("Readers of gentle adventures");
  await page.getByRole("button", { name: "Generate AI draft", exact: true }).click();
  await expect(page.getByLabel("Your draft", { exact: true })).toHaveValue(/A small boat/);
  await page.getByLabel("Your draft", { exact: true }).fill("My reviewed version about a paper boat.");
  await page.getByText("Ad budget plan (optional)", { exact: true }).click();
  await page.getByLabel("Daily ad budget").fill("50");
  await page.getByLabel("Budget days").fill("7");
  await expect(page.getByText("Planned total: 350 SEK")).toBeVisible();
  failSave = true;
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not save this draft" })).toContainText("Your text is still here");
  await expect(page.getByLabel("Your draft", { exact: true })).toHaveValue("My reviewed version about a paper boat.");
  failSave = false;
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your material library");
  expect(assets[0]).toMatchObject({ text: "My reviewed version about a paper boat.", metadata: { dailyBudget: "50", currency: "SEK", days: "7" } });
  await page.reload();
  await page.getByRole("button", { name: /Edit draft/ }).click();
  await expect(page.getByLabel("Your draft", { exact: true })).toHaveValue("My reviewed version about a paper boat.");
  await expect(page.getByLabel("Intended audience")).toHaveValue("Readers of gentle adventures");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("marketing-studio-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Your draft", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("marketing-studio-mobile.png"), fullPage: true });
});

test("campaign creation previews its scope and retains every selected channel", async ({ page }) => {
  await page.route("**/api/marketing/assets**", route => route.fulfill({ json: { assets: [] } }));
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/author/marketing/campaigns", route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { detail: "Test consumer unavailable. Your selections are kept." } });
  });
  await page.goto("/dev/marketing-studio");
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
  await page.getByRole("button", { name: "Create campaign plan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Select all" }).check();
  await dialog.getByRole("button", { name: /1–3/ }).click();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel("Plan length").selectOption("2");
  await expect(dialog.getByText("12 drafts to generate", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /Generate|Create campaign/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("Your selections are kept");
  expect(submitted).toMatchObject({ durationWeeks: 2, mode: "organic", contentTypes: ["text"] });
  const schedule = submitted!.weeklySchedule as Record<string, string[]>;
  expect(new Set(Object.values(schedule).flat()).size).toBe(6);
  await expect(dialog.getByLabel("Plan length")).toHaveValue("2");
});


test("unsaved draft survives cancelled internal navigation", async ({ page }) => {
  await page.route("**/api/marketing/assets**", route => route.fulfill({ json: { assets: [] } }));
  await page.goto("/dev/marketing-studio");
  await page.getByLabel("Your draft", { exact: true }).fill("Keep my reviewed text.");
  let confirmations = 0;
  page.on("dialog", async dialog => { confirmations++; await dialog.dismiss(); });
  await page.getByRole("link", { name: "Ad drafts & budgets" }).click();
  await expect(page).toHaveURL(/dev\/marketing-studio$/);
  await expect(page.getByLabel("Your draft", { exact: true })).toHaveValue("Keep my reviewed text.");
  expect(confirmations).toBe(1);
});

test("media provider failure can be retried and edited without reloading", async ({ page }) => {
  let revision = "2026-09-24T10:00:00Z";
  let attempts = 0;
  const post = { id: "preview-post", scheduledFor: "2026-09-28T12:00:00Z", channel: "instagram", language: "en", contentType: "podcast", headline: null, caption: "A paper boat on the river.", hashtags: "#Books", cta: null, shareUrl: null, mediaAssetId: null, mediaAssetUrl: null, postedAt: null, postedUrl: null, mode: "organic" };
  await page.route("**/api/author/marketing/campaigns/preview-campaign", route => route.fulfill({ json: { posts: [{ ...post, status: "asset_failed", updatedAt: revision, assetError: "Provider temporarily unavailable." }] } }));
  await page.route("**/api/author/marketing/posts/preview-post/generate-audio", route => {
    expect(route.request().postDataJSON().expectedUpdatedAt).toBe(revision);
    attempts++; revision = `2026-09-24T10:0${attempts}:00Z`;
    return route.fulfill({ status: 502, json: { error: "AUDIO_FAILED" } });
  });
  await page.route("**/api/author/marketing/posts/preview-post", route => {
    expect(route.request().postDataJSON().expectedUpdatedAt).toBe(revision);
    return route.fulfill({ json: { post: { ...post, ...route.request().postDataJSON(), updatedAt: "2026-09-24T11:00:00Z" } } });
  });
  await page.goto("/dev/marketing-studio?view=campaign");
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
  await page.getByText(post.caption, { exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Generate audio clip" }).click();
  await expect(drawer.getByText("Provider temporarily unavailable.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Generate audio clip" })).toBeEnabled();
  await drawer.getByRole("button", { name: "Generate audio clip" }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(drawer.getByRole("button", { name: "Generate audio clip" })).toBeEnabled();
  await drawer.getByLabel("Caption", { exact: true }).fill("Reviewed after retry.");
  await drawer.getByRole("button", { name: "Save edits" }).click();
  await expect(drawer.getByRole("button", { name: "Saved!", exact: true })).toBeVisible();
});


test("browser history restores unsaved text and its brief", async ({ page }) => {
  await page.route("**/api/marketing/assets**", route => route.fulfill({ json: { assets: [] } }));
  await page.goto("/dev/marketing-studio?view=campaign");
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
  // Same-document navigation reproduces App Router Back/Forward behavior.
  await page.getByRole("link", { name: "Open studio preview" }).click();
  await page.getByLabel("Your draft", { exact: true }).fill("Recover my unsaved marketing draft.");
  await page.getByLabel("Intended audience").fill("Young readers");
  await page.goBack();
  await expect(page.getByText("Private review", { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Your draft", { exact: true })).toHaveValue("Recover my unsaved marketing draft.");
  await expect(page.getByLabel("Intended audience")).toHaveValue("Young readers");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
});
