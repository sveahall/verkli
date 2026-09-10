import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("verkli-cookie-consent", "declined");
    localStorage.setItem("verkli-theme", "light");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/notifications**", (route) => route.fulfill({ status: 200, json: { count: 0, notifications: [] } }));
  // Creation is exercised through a controlled failure; no book or paid job
  // may be written while testing the form and translation controls.
  await page.route("**/api/books", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 503, json: { error: "GENERIC_ERROR" } })
    : route.continue());
  await page.route("**/api/books/*/translate", (route) => route.abort());
});

test("new book is named, keeps keyboard focus, and restores its trigger", async ({ page }) => {
  await page.goto("/author/library");
  const trigger = page.getByRole("button", { name: "New book", exact: true }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "New book", exact: true });
  await expect(dialog).toBeVisible();
  const title = dialog.getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toBeFocused();
  await trigger.evaluate((element) => element.focus());
  await expect(title).toBeFocused();
  const close = dialog.getByRole("button", { name: "Close new book", exact: true });
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("new book submits with Enter and announces a recoverable error", async ({ page }) => {
  await page.goto("/author/library");
  await page.getByRole("button", { name: "New book", exact: true }).first().click();
  const title = page.getByPlaceholder("Book title", { exact: true });
  await title.fill("Keyboard QA book");
  const request = page.waitForRequest((value) => value.url().endsWith("/api/books") && value.method() === "POST");
  await title.press("Enter");
  expect((await request).postDataJSON()).toEqual({ title: "Keyboard QA book", language: "en" });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Something went wrong. Try again.");
  await expect(page.getByRole("button", { name: "Create book", exact: true })).toBeEnabled();
});

test("new book fits a short mobile viewport with a reachable submit control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await page.goto("/author/library");
  await page.getByRole("button", { name: "New book", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(16);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(464);
  await dialog.getByRole("button", { name: "Create book", exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Create book", exact: true })).toBeInViewport();
});

test("switching from new book keeps the import dialog open", async ({ page }) => {
  await page.goto("/author/library");
  await page.getByRole("button", { name: "New book", exact: true }).first().click();
  await page.getByRole("button", { name: "import from file", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import book", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("heading", { name: "Import book", exact: true })).toBeVisible();
});

test("translation target has a label and changes the preview with the keyboard", async ({ page }) => {
  await page.route("**/api/books/*/translation-preview?**", (route) => {
    const language = new URL(route.request().url()).searchParams.get("targetLanguage");
    return route.fulfill({ status: 200, json: { originalText: "Original sample", previewText: `Preview in ${language}` } });
  });
  await page.goto("/author/library");
  const fixture = page.getByRole("link", { name: /Continue editing E2E fixture — automated test book/i });
  await expect(fixture).toBeVisible();
  const url = new URL((await fixture.getAttribute("href"))!, page.url());
  url.searchParams.set("panel", "translate");
  await page.goto(url.toString());
  test.skip(await page.getByRole("heading", { name: "Translation is not available in this workspace.", exact: true }).isVisible(),
    "Run the local preview with NEXT_PUBLIC_TRANSLATIONS_ENABLED=true to exercise translation controls.");
  const target = page.getByRole("combobox", { name: "Target language", exact: true });
  await expect(target).toBeVisible();
  await target.focus();
  await target.press("Home");
  const value = await target.inputValue();
  await expect(page.getByText(`Preview in ${value}`, { exact: true })).toBeVisible();
  await expect(target).toBeFocused();
});

test("reader settings dismiss with Escape and restore focus without changing preferences", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.request().method() === "GET"
    ? route.continue()
    : route.fulfill({ status: 200, json: [] }));
  await page.route("**/api/reader/**", (route) => route.request().method() === "GET"
    ? route.continue()
    : route.fulfill({ status: 200, json: { ok: true } }));
  await page.goto("/author/library");
  const fixture = page.getByRole("link", { name: /Continue editing E2E fixture — automated test book/i });
  const bookUrl = new URL((await fixture.getAttribute("href"))!, page.url());
  const response = await page.request.get(`/api/books/${bookUrl.pathname.split("/").pop()}/chapters`);
  expect(response.ok()).toBe(true);
  const chapters = (await response.json()).data.chapters;
  expect(chapters.length).toBeGreaterThan(0);
  await page.goto(`/reader/read/${chapters[0].id}`);
  const trigger = page.getByRole("button", { name: "Reader settings", exact: true });
  await trigger.click();
  const lineSpacing = page.getByRole("combobox", { name: "Line spacing", exact: true });
  await lineSpacing.focus();
  const previousValue = await lineSpacing.inputValue();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(lineSpacing).toHaveValue(previousValue);
});
