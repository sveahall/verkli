import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      if (new URL(route.request().url()).hostname.endsWith(".sentry.io")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      throw new Error(`Studio demo attempted a write: ${route.request().url()}`);
    }
    await route.continue();
  });
  await page.goto("/author");
  const cookies = page.getByRole("button", { name: "Essential only", exact: true });
  if (await cookies.isVisible()) await cookies.click();
});

test("one manuscript carries through to the reader preview", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Write", exact: true })).toBeVisible({ timeout: 3000 });
  await page.getByRole("textbox", { name: "Book title", exact: true }).fill("A story worth sharing");
  await page.getByRole("textbox", { name: "Your manuscript", exact: true }).fill("The morning was ours. We had a world to discover.");
  await page.getByRole("tab", { name: "Publish", exact: true }).click();
  await expect(page.getByTestId("book-preview-title")).toHaveText("A story worth sharing");
  await page.getByRole("button", { name: "Open the book", exact: true }).click();
  await expect(page.getByTestId("reader-passage")).toContainText("The morning was ours.");
  await page.getByRole("button", { name: "Midnight cover", exact: true }).click();
  await expect(page.getByRole("button", { name: "Midnight cover", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a suggested edit requires acceptance and can be undone", async ({ page }) => {
  const manuscript = page.getByRole("textbox", { name: "Your manuscript", exact: true });
  const original = await manuscript.inputValue();
  await page.getByRole("button", { name: "Make it vivid", exact: true }).click();
  await expect(page.getByTestId("suggested-passage")).toBeVisible();
  await expect(manuscript).toHaveValue(original);
  await page.getByRole("button", { name: "Use this version", exact: true }).click();
  await expect(manuscript).not.toHaveValue(original);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(manuscript).toHaveValue(original);
});

test("custom writing never receives an unrelated sample translation or recording", async ({ page }) => {
  await page.getByRole("textbox", { name: "Your manuscript", exact: true }).fill("My own manuscript.");
  await page.getByRole("tab", { name: "Translate", exact: true }).click();
  await expect(page.getByText("Your own words are saved in this preview.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("translated-passage")).toHaveCount(0);
  await page.getByRole("button", { name: "Load the sample", exact: true }).click();
  await page.getByRole("button", { name: "Svenska", exact: true }).click();
  await expect(page.getByTestId("translated-passage")).toContainText("Pärmen vägrade");
});

test("narration advances, seeks, changes speed and stops when leaving the player", async ({ page }) => {
  await page.getByRole("tab", { name: "Listen", exact: true }).click();
  const audio = page.locator("audio[data-author-sample]");
  await expect(audio).toHaveJSProperty("paused", true);
  await page.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Playback speed 1 times", exact: true }).click();
  await expect(audio).toHaveJSProperty("playbackRate", 1.25);
  await page.getByRole("slider", { name: "Playback position", exact: true }).fill("6");
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThanOrEqual(6);
  await page.getByRole("tab", { name: "Publish", exact: true }).click();
  await expect(audio).toHaveJSProperty("paused", true);
});

test("a media error has a recoverable state", async ({ page }) => {
  await page.route("**/demo-assets/audio/en.mp3", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.getByRole("tab", { name: "Listen", exact: true }).click();
  await page.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText("couldn’t play");
  await page.getByRole("button", { name: "Français", exact: true }).click();
  await expect(page.getByRole("tabpanel").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect.poll(() => page.locator("audio[data-author-sample]").evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
});

test("keyboard and mobile controls work without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Write", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Translate", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Deutsch", exact: true }).click();
  await expect(page.getByTestId("translated-passage")).toHaveAttribute("lang", "de");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Get early access", exact: true }).first().click();
  await expect(page).toHaveURL(/\/waitlist$/, { timeout: 15000 });
});

test("existing section links open the matching studio", async ({ page }) => {
  await page.goto("/author#audio");
  await expect(page.getByRole("tab", { name: "Listen", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Play narration", exact: true })).toBeInViewport();
  await page.evaluate(() => { window.location.hash = "writing"; });
  await expect(page.getByRole("tab", { name: "Write", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("the guided tour never plays audio and stops when the visitor takes over", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("link", { name: "Explore the studio", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Listen", exact: true })).toHaveAttribute("aria-selected", "true", { timeout: 18000 });
  await expect(page.locator("audio[data-author-sample]")).toHaveJSProperty("paused", true);
  await page.getByRole("tab", { name: "Write", exact: true }).click();
  await page.getByRole("textbox", { name: "Your manuscript", exact: true }).fill("My next chapter.");
  await expect(page.getByRole("button", { name: "Play tour", exact: true })).toBeVisible();
  await page.waitForTimeout(7600);
  await expect(page.getByRole("tab", { name: "Write", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Your manuscript", exact: true })).toHaveValue("My next chapter.");
});
