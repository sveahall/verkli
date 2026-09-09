import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route("**/*", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      throw new Error(`Public demo attempted a write: ${route.request().url()}`);
    }
    await route.continue();
  });
  await page.goto("/author");
  await expect(page.getByRole("heading", { name: "Your story. Supercharged." })).toBeVisible();
  const cookies = page.getByRole("button", { name: "Essential only", exact: true });
  if (await cookies.isVisible()) await cookies.click();
});

test("a visitor can try a rewrite and undo it without changing the original", async ({ page }) => {
  const editor = page.getByRole("region", { name: "Writing demo" });
  const passage = editor.getByTestId("writing-passage");
  const original = await passage.innerText();
  await editor.getByRole("button", { name: "Make it vivid", exact: true }).click();
  await expect(passage).not.toHaveText(original);
  await expect(editor.getByRole("button", { name: "Make it vivid", exact: true })).toHaveAttribute("aria-pressed", "true");
  await editor.getByRole("button", { name: "Make it concise", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(passage).toContainText("The diary wrote itself");
  await editor.getByRole("button", { name: "Restore original", exact: true }).click();
  await expect(passage).toHaveText(original);
});

test("changing language updates the excerpt and stops existing narration", async ({ page }) => {
  const translation = page.getByRole("region", { name: "Translation demo" });
  const player = page.getByRole("region", { name: "Audiobook demo" });
  const audio = page.locator("audio[data-author-sample]");
  await expect(audio).toHaveJSProperty("paused", true);
  await player.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect(audio).toHaveJSProperty("paused", false);
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
  await translation.getByRole("button", { name: "Svenska", exact: true }).click();
  await expect(translation.getByTestId("translated-passage")).toContainText("Pärmen vägrade");
  await expect(audio).toHaveAttribute("src", "/demo-assets/audio/sv.mp3");
  await expect(audio).toHaveJSProperty("paused", true);
  await expect(audio).toHaveJSProperty("currentTime", 0);
  await player.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect(audio).toHaveJSProperty("paused", false);
  await player.getByRole("button", { name: "Pause narration", exact: true }).click();
  await expect(audio).toHaveJSProperty("paused", true);
});

test("a failed audio sample explains the problem and recovers on another language", async ({ page }) => {
  await page.route("**/demo-assets/audio/en.mp3", (route) => route.fulfill({ status: 503, body: "Sample unavailable" }));
  const player = page.getByRole("region", { name: "Audiobook demo" });
  await player.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect(player.getByText("We couldn’t play this sample. Try again or choose another language.")).toBeVisible();
  await player.getByRole("button", { name: "Français", exact: true }).click();
  await expect(player.getByText("We couldn’t play this sample. Try again or choose another language.")).toBeHidden();
  await player.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect(page.locator("audio[data-author-sample]")).toHaveJSProperty("paused", false);
});

test("hero and player share one recording, with real speed, seeking and replay", async ({ page }) => {
  const audio = page.locator("audio[data-author-sample]");
  const player = page.getByRole("region", { name: "Audiobook demo" });
  await expect(audio).toHaveCount(1);
  await page.getByRole("button", { name: "Play story sample", exact: true }).click();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
  await expect(player.getByRole("button", { name: "Pause narration", exact: true })).toBeVisible();
  await player.getByRole("button", { name: "Playback speed 1 times", exact: true }).click();
  await expect(audio).toHaveJSProperty("playbackRate", 1.25);
  await player.getByRole("button", { name: "Pause narration", exact: true }).click();
  const seek = player.getByRole("slider", { name: "Playback position", exact: true });
  await seek.fill("7");
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThanOrEqual(7);
  await seek.focus();
  await page.keyboard.press("End");
  await player.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect(audio).toHaveJSProperty("ended", true);
  await player.getByRole("button", { name: "Play narration", exact: true }).click();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeLessThan(2);
  await expect(audio).toHaveJSProperty("paused", false);
});

test("mobile and reduced motion retain usable controls without horizontal clipping", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const translation = page.getByRole("region", { name: "Translation demo" });
  await translation.getByRole("button", { name: "Deutsch", exact: true }).click();
  await expect(translation.getByTestId("translated-passage")).toHaveAttribute("lang", "de");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const button of await page.locator("[data-experience] button").all()) {
    if (await button.isVisible()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("link", { name: "Join the waitlist", exact: true }).last().click();
  await expect(page).toHaveURL(/\/waitlist$/);
});
