import { test, expect } from "@playwright/test";

for (const path of ["/waitlist", "/author"]) {
  for (const [hash, tab] of [["audio", "Listen"], ["publishing", "Publish"]]) {
    test(`${path} direct ${hash} link hydrates cleanly and selects the right tool`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && /hydrat|server.render|didn.t match/i.test(message.text())) errors.push(message.text());
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${path}#${hash}`);
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("audio[data-author-sample]")).toHaveJSProperty("paused", true);
      expect(errors).toEqual([]);
    });
  }

  test(`${path} repeating a feature link reopens its tool after a manual tab change`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${path}#translation`);
    await expect(page.getByRole("tab", { name: "Translate", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Write", exact: true }).click();
    if (path === "/author") {
      const detail = page.locator("#possibilities details").nth(1);
      await detail.scrollIntoViewIfNeeded();
      if (await detail.getAttribute("open") === null) await detail.locator("summary").click();
      await detail.getByRole("link", { name: "Explore translation", exact: true }).click();
    } else {
      await page.locator(".wl-capabilities").getByRole("link", { name: "Translate", exact: true }).click();
    }
    await expect(page.getByRole("tab", { name: "Translate", exact: true })).toHaveAttribute("aria-selected", "true");
  });
}

test("mobile feature chapters can be scrolled with the keyboard and keep focus visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/waitlist#how-it-works");
  const chapters = page.getByRole("region", { name: "From manuscript to readers", exact: true });
  await chapters.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => chapters.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await chapters.getByRole("link", { name: "Open a book", exact: true }).focus();
  await expect(chapters.getByRole("link", { name: "Open a book", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
