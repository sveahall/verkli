import { expect, test } from "@playwright/test";

const id = "00000000-0000-0000-0000-000000000001";
const retryUrl = `**/api/books/imports/${id}`;
test.beforeEach(async ({ page }) => {
  // Unhandled application API calls cannot reach even the local backend.
  await page.route("**/api/**", (route) => route.abort());
});

test("recovery conflict retains reference, blocks retry, and preserves the draft", async ({ page }, info) => {
  let posts = 0;
  await page.route(retryUrl, (route) => { posts++; return route.fulfill({ status: 409, json: {
    error: "IMPORT_RECOVERY_CHECKPOINT_UNAVAILABLE", reference: id,
  } }); });
  await page.goto("/dev/import-retry");
  await page.getByLabel("Unsaved draft").fill("Keep this unsaved chapter.");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const banner = page.getByRole("status").filter({ hasText: "Import: Failed" });
  await expect(banner).toContainText("start a separate new import");
  await expect(banner).toContainText(`Support reference: ${id}`);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await page.getByLabel("Chapter", { exact: true }).selectOption("Chapter 2");
  await expect(page.getByLabel("Unsaved draft")).toHaveValue("Keep this unsaved chapter.");
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
  await expect(banner).toContainText(`Support reference: ${id}`);
  await page.screenshot({ path: info.outputPath("recovery-conflict.png"), fullPage: true });
});

test("double click queues once, then shows server progress", async ({ page }, info) => {
  let posts = 0;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route(retryUrl, async (route) => {
    posts++;
    await wait;
    await route.fulfill({ json: { ok: true, id, message: "Import re-queued." } });
  });
  let status = "pending";
  await page.route(`**/api/books/${id}/jobs`, (route) => route.fulfill({ json: { jobs: [{
    id, kind: "import", status, language: "en", bookVersionId: id, progress: status === "running" ? 50 : 0,
    meta: { totalChapters: 2, completedChapters: status === "running" ? 1 : 0 }, error: null,
    createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
  }] } }));
  await page.goto("/dev/import-retry");
  // Dispatch two clicks in one browser task, before React can commit disabled.
  await page.getByRole("button", { name: "Retry", exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
  });
  await expect(page.getByRole("button", { name: "Retrying…" })).toBeDisabled();
  expect(posts).toBe(1);
  release();
  await expect(page.getByRole("status").filter({ hasText: "Import: Queued" })).toBeVisible();
  status = "running";
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Import: Running" })).toContainText("1 / 2 chapters");
  await page.screenshot({ path: info.outputPath("retry-progress.png"), fullPage: true });
});

test("network failure reports uncertainty without false success or blind retry", async ({ page }) => {
  let posts = 0;
  await page.route(retryUrl, (route) => { posts++; return route.abort("failed"); });
  await page.goto("/dev/import-retry");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Refresh status before retrying");
  await expect(page.getByText("Import re-queued.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  expect(posts).toBe(1);
});

test("chapter change ignores a late response and preserves the unsaved draft", async ({ page }) => {
  let release!: () => void;
  let posted!: () => void;
  const arrived = new Promise<void>((resolve) => { posted = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  await page.route(`**/api/books/${id}/jobs`, (route) => { reads++; return route.abort(); });
  await page.route(retryUrl, async (route) => {
    posted(); await wait;
    await route.fulfill({ json: { ok: true, id, message: "Import re-queued." } }).catch(() => {});
  });
  // Also prove the scope guard when a transport ignores AbortSignal.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => originalFetch(input, String(input).includes("/api/books/imports/")
      ? { ...options, signal: undefined } : options);
  });
  await page.goto("/dev/import-retry");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await arrived;
  await page.getByLabel("Chapter", { exact: true }).selectOption("Chapter 2");
  const lateResponse = page.waitForResponse((response) => response.url().endsWith(`/api/books/imports/${id}`));
  release();
  await (await lateResponse).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole("status")).toContainText("Import retry status is unknown");
  await expect(page.getByText("Import re-queued.", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Unsaved draft")).toHaveValue("My unsaved manuscript stays here.");
  expect(reads).toBe(0);
});
