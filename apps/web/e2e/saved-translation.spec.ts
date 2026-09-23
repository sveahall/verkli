import { test, expect } from "@playwright/test";

// Local development fixture only. All API/provider/payment calls are intercepted
// inside the fixture; these assertions are not evidence of provider quality.
const browserErrors: string[] = [];
test.afterEach(() => { expect(browserErrors).toEqual([]); });
test.beforeEach(async ({ page }) => { browserErrors.length = 0; page.on("console", (message) => { if (message.type() === "error" && /same key|Uncaught|Maximum update/i.test(message.text())) browserErrors.push(message.text()); }); await page.goto("/dev/translation-studio"); await expect(page.getByRole("button", { name: "Open saved translation", exact: true })).toBeVisible(); });
const comparison = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Read your saved translation" });
const open = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Open saved translation", exact: true }).click();

test("opens current saved chapters and historical findings without generating or paying; reload is safe", async ({ page }) => {
  await open(page);
  await expect(comparison(page).getByText("Saved Swedish edition: saved-sv")).toBeVisible();
  await expect(comparison(page).getByText("Den sista färjan", { exact: false })).toBeVisible();
  await comparison(page).locator("summary").filter({ hasText: "Book report" }).click();
  await comparison(page).locator("summary").filter({ hasText: "Historical findings" }).click();
  await expect(comparison(page).getByText("Synthetic historical finding: the negation was lost.")).toBeVisible();
  await comparison(page).getByLabel("Chapter comparison").selectOption("1");
  await expect(comparison(page).getByText("[sv saved chapter two]", { exact: true })).toBeVisible();
  const evidence = await page.getByTestId("requests").textContent();
  expect(evidence).not.toMatch(/translation-preview|\/translate["?]|checkout/);
  await page.reload(); await open(page);
  await expect(comparison(page).getByText("Saved Swedish edition: saved-sv")).toBeVisible();
});

test("drops late responses when language or source edition changes", async ({ page }) => {
  await page.getByLabel("State", { exact: true }).selectOption("slow");
  await open(page);
  await page.getByLabel("Target language").selectOption("ar");
  await expect(comparison(page).getByText("Saved Swedish edition: saved-sv")).toHaveCount(0);
  await open(page);
  await expect(comparison(page).getByText("Saved Arabic edition: saved-ar")).toBeVisible();
  await expect(comparison(page).locator('p[lang="ar"]')).toHaveAttribute("dir", "auto");
  await page.getByRole("button", { name: "Refresh saved translation" }).click();
  await page.getByLabel("Source edition", { exact: true }).selectOption("other-edition");
  await open(page);
  await expect(comparison(page).getByText("Source edition: other-edition")).toBeVisible();
  await expect(comparison(page).getByText("Another source edition.", { exact: true })).toBeVisible();
  await expect(comparison(page).locator("summary").first()).toContainText("Text changed since review");
});

for (const [mode, expected] of [["unavailable", "No saved translation for this language yet"], ["empty", "This edition has no saved chapters yet"], ["failure", "Could not load the saved translation"], ["report-failure", "The saved text loaded, but its reports could not be loaded"], ["edited", "Text changed since review"], ["oversized", "This book is too large for the comparison view. Open its chapters in Write."]]) {
  test(`handles ${mode} without false success`, async ({ page }) => {
    await page.getByLabel("State", { exact: true }).selectOption(mode); await open(page);
    await expect(comparison(page).getByText(expected, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh saved translation" })).toBeEnabled();
    if (mode === "failure") await expect(comparison(page).getByText("Current saved translation", { exact: false })).toHaveCount(0);
  });
}

test("keeps mobile comparison readable and preview explicitly requested", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  await expect(comparison(page).getByText("Saved Swedish edition: saved-sv")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Generate opening preview" }).click();
  await expect(page.getByTestId("requests")).toContainText("translation-preview");
});
