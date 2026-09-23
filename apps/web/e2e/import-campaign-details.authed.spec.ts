import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("verkli-cookie-consent", "declined");
    localStorage.setItem("verkli-theme", "light");
  });
  await page.route("**/api/books/imports?**", (route) => route.fulfill({ status: 200, json: { imports: [] } }));
  await page.route("**/api/books/import", (route) => route.abort());
  await page.route("**/api/marketing/campaigns**", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
});

test("import is a named modal with keyboard file selection and a contained short-screen layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto("/author/library");
  const trigger = page.getByRole("button", { name: "New book", exact: true }).first();
  await trigger.click();
  await page.getByRole("button", { name: /Upload a book/ }).click();
  const dialog = page.getByRole("dialog", { name: "Import book", exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(16);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(552);
  const checkboxes = dialog.getByRole("checkbox");
  for (const checkbox of await checkboxes.all()) await checkbox.check();
  await dialog.getByRole("radio", { name: "no", exact: true }).check();
  const picker = dialog.getByLabel("Choose a book file");
  await expect(picker).toBeEnabled();
  await picker.focus();
  await expect(picker).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // The import control lives in the now-closed new-book dialog. Focus returns
  // to the page's persistent entry point, rather than the hidden control.
  await expect(trigger).toBeFocused();
});

test("campaign wizard is named, traps focus and closes back to its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto("/author/marketing");
  const trigger = page.getByRole("button", { name: "Create campaign", exact: true });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Create campaign", exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(16);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(552);
  await trigger.evaluate((node) => node.focus());
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("every campaign step fits a narrow screen without horizontal clipping", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto("/author/marketing");
  await page.getByRole("button", { name: "Create campaign", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create campaign", exact: true });
  for (let step = 1; step <= 5; step += 1) {
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), `step ${step}`).toBe(true);
    if (step === 4) {
      await dialog.getByRole("button", { name: "Instagram", exact: true }).click();
      await dialog.getByRole("button", { name: /1–3/ }).click();
    }
    if (step < 5) await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.keyboard.press("Escape");
});

// F1: mocked import I/O on the authenticated library surface.
test("F1 import preserves active jobs through status errors and recovers", async ({ page }) => {
  let status: "ok" | "network" | "http" = "ok";
  await page.route("**/api/books/imports?**", (route) => {
    if (status === "network") return route.abort();
    if (status === "http") return route.fulfill({ status: 500, json: { error: "GENERIC_ERROR" } });
    return route.fulfill({ json: { imports: [{ id: "f1-job", file_name: "f1-sample.txt", status: "running", progress: 25, error: null, book_id: null, created_at: new Date().toISOString() }] } });
  });
  await page.goto("/author/library");
  await page.getByRole("button", { name: "New book", exact: true }).first().click();
  await page.getByRole("button", { name: "import from file", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import book", exact: true });
  await expect(dialog.getByText("Running 25%", { exact: true })).toBeVisible();
  for (const failure of ["network", "http"] as const) {
    status = failure;
    await expect(dialog.getByRole("alert")).toContainText("Could not refresh import status", { timeout: 10_000 });
    await expect(dialog.getByText("f1-sample.txt", { exact: true })).toBeVisible();
    await expect(dialog.getByText("No imports yet.", { exact: true })).toHaveCount(0);
    status = "ok";
    await expect(dialog.getByRole("alert")).toHaveCount(0, { timeout: 10_000 });
  }
  await page.keyboard.press("Escape");
});

test("F1 import accepts only one of two synchronous drops", async ({ page }) => {
  let uploads = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/books/import", async (route) => {
    uploads++;
    await pending;
    await route.fulfill({ status: 503, json: { error: "GENERIC_ERROR" } });
  });
  try {
    await page.goto("/author/library");
    await page.getByRole("button", { name: "New book", exact: true }).first().click();
    await page.getByRole("button", { name: "import from file", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Import book", exact: true });
    for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
    await dialog.getByRole("radio", { name: "no", exact: true }).check();
    await dialog.getByLabel("Choose a book file").evaluate((input) => {
      for (let i = 0; i < 2; i++) {
        const transfer = new DataTransfer();
        transfer.items.add(new File(["Synthetic manuscript"], `f1-${i}.txt`, { type: "text/plain" }));
        input.parentElement!.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      }
    });
    await expect(dialog.getByText("Uploading...", { exact: true })).toBeVisible();
    await expect.poll(() => uploads).toBe(1);
    release!();
    await expect(dialog.getByLabel("Choose a book file")).toBeEnabled();
    expect(uploads).toBe(1);
    await expect(dialog.getByRole("alert")).toBeVisible();
  } finally { release?.(); }
});
