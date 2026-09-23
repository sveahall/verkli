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


test("keeps the displayed target and read request consistent after changing source language", async ({ page }) => {
  await page.getByLabel("Source edition", { exact: true }).selectOption("swedish-edition");
  await expect(page.getByLabel("Target language")).toHaveValue("en");
  await expect(page.getByText("Full book → English", { exact: true })).toBeVisible();
  await open(page);
  await expect(comparison(page).getByText("Saved English edition: saved-en")).toBeVisible();
  const requests = JSON.parse(await page.getByTestId("requests").textContent() ?? "[]");
  const saved = requests.filter((item: { path: string }) => item.path.includes("/saved-translation"));
  expect(saved).toHaveLength(1);
  expect(saved[0].path).toContain("targetLanguage=en");
  expect(saved[0].path).toContain("sourceVersionId=swedish-edition");
  expect(JSON.stringify(requests)).not.toMatch(/translation-preview|\/translate["?]|checkout/);
});

for (const [code, label, edition] of [["nl", "Dutch", "dutch-edition"], ["pl", "Polish", "polish-edition"]]) {
  test(`opens saved ${label} target and uses its edition as a new source`, async ({ page }) => {
    await page.getByLabel("Target language").selectOption(code);
    await open(page);
    await expect(comparison(page).getByText(`Saved ${label} edition: saved-${code}`)).toBeVisible();
    await page.getByLabel("Source edition", { exact: true }).selectOption(edition);
    await expect(page.getByLabel("Target language")).not.toHaveValue(code);
    await open(page);
    await expect(comparison(page).getByText(`Source edition: ${edition}`)).toBeVisible();
    await expect(comparison(page).getByText(`[${code} synthetic source text]`, { exact: true })).toBeVisible();
    expect(await page.getByTestId("requests").textContent()).not.toMatch(/translation-preview|\/translate["?]|checkout/);
  });
}
