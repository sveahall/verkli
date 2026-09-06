import { expect, test, type Page } from "@playwright/test";

// These public-page checks never need third-party services or real auth.
test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:3000").origin;
  await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
});

async function openAuthorPage(page: Page) {
  await page.goto("/author");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const essentialOnly = page.getByRole("button", { name: "Essential only", exact: true });
  if (await essentialOnly.isVisible()) await essentialOnly.click();
}

test("public author page offers signup and a working workspace preview", async ({ page }) => {
  await openAuthorPage(page);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(main.getByRole("link", { name: "Start writing for free" }).first()).toHaveAttribute("href", "/author/signup");
  await main.getByRole("link", { name: "Explore the workspace" }).click();
  await expect(page).toHaveURL(/#workspace$/);
  await expect(main.getByRole("tab", { name: "Writing", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(main.getByRole("tabpanel")).toContainText("The morning the lighthouse went dark");
  await expect(main.getByRole("link", { name: "How it works", exact: true })).toHaveAttribute("href", "/how-it-works");
  await expect(main.getByRole("link", { name: "View pricing", exact: true })).toHaveAttribute("href", "/pricing");
});

test("preview choices change content with pointer and keyboard", async ({ page }) => {
  await openAuthorPage(page);
  const writing = page.getByRole("tab", { name: "Writing", exact: true });
  const translate = page.getByRole("tab", { name: "Translate", exact: true });
  const listen = page.getByRole("tab", { name: "Listen", exact: true });
  for (const tab of [writing, translate, listen]) {
    const target = await tab.getAttribute("aria-controls");
    expect(target).toBeTruthy();
    await expect(page.locator(`[id="${target}"]`)).toHaveCount(1);
  }
  await translate.click();
  await expect(translate).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("La mañana en que el faro se apagó");
  await translate.press("ArrowRight");
  await expect(listen).toBeFocused();
  await expect(listen).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Choose a voice");
  await expect(page.getByRole("tabpanel")).toContainText("No audio is generated in this preview");
  await listen.press("ArrowRight");
  await expect(writing).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("The morning the lighthouse went dark");
  await writing.press("End");
  await expect(listen).toBeFocused();
  await listen.press("Home");
  await expect(writing).toBeFocused();
  await writing.press("ArrowLeft");
  await expect(listen).toBeFocused();
});

test("mobile preview stays readable and inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await openAuthorPage(page);
  await page.getByRole("tab", { name: "Translate", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("La mañana en que el faro se apagó");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const heroHeading = page.getByRole("heading", { level: 1 });
  const heroText = await heroHeading.evaluate((heading) => {
    const range = document.createRange();
    range.selectNodeContents(heading);
    const rects = Array.from(range.getClientRects());
    return { left: Math.min(...rects.map((rect) => rect.left)), right: Math.max(...rects.map((rect) => rect.right)) };
  });
  expect(heroText.left).toBeGreaterThanOrEqual(0);
  expect(heroText.right).toBeLessThanOrEqual(320);
  for (const element of [heroHeading, page.getByRole("link", { name: "Start writing for free" }).first(), page.getByRole("link", { name: "Explore the workspace" })]) {
    const bounds = await element.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  }
  const voiceHeading = page.getByRole("heading", { name: /More possibilities/ });
  const textRight = await voiceHeading.evaluate((heading) => {
    const range = document.createRange();
    range.selectNodeContents(heading);
    return Math.max(...Array.from(range.getClientRects(), (rect) => rect.right));
  });
  expect(textRight).toBeLessThanOrEqual(320);
  const introduction = await page.getByText(/Your imagination. An entire AI workspace/).innerText();
  expect(introduction).toMatch(/workspace\.\s+Write/);
  for (const tab of await page.getByRole("tab").all()) {
    const bounds = await tab.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
});
