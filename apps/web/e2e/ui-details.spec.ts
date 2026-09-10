import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("verkli-cookie-consent", "declined");
    localStorage.setItem("verkli-theme", "light");
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/author");
});

test("Product opens with the keyboard, navigates destinations and returns focus on Escape", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Product", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const panel = page.getByRole("region", { name: "Product navigation" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: /Product/ }).first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(panel.getByRole("link", { name: /How it works/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/author$/);
});

test("Product click toggles the panel and an outside click dismisses it", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Product", exact: true });
  const panel = page.getByRole("region", { name: "Product navigation" });
  await trigger.click();
  await expect(panel).toBeVisible();
  await trigger.click();
  await expect(panel).toHaveCount(0);
  await trigger.click();
  await page.mouse.click(1000, 160);
  await expect(panel).toHaveCount(0);
});

test("mobile navigation includes child destinations and traps focus until dismissed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", { name: "Open menu", exact: true });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: /How it works/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: /How it works/ }).click();
  await expect(page).toHaveURL(/\/how-it-works/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
