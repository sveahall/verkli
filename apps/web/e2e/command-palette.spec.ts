import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("verkli-cookie-consent", "declined"));
  await page.goto("/dev/studio-overview?view=library");
  await page.getByRole("button", { name: "Open command palette", exact: true }).click();
});

test("keyboard focus stays in the command dialog and returns to its opener", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Command palette", exact: true });
  const search = dialog.getByRole("textbox", { name: "Search commands...", exact: true });
  await expect(dialog).toBeVisible();
  await expect(search).toBeFocused();
  const lastCommand = dialog.getByRole("button").last();

  await page.keyboard.press("Shift+Tab");
  await expect(lastCommand).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();

  await search.fill("no-matching-command-20260920");
  await expect(dialog.getByText("No commands found", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open command palette", exact: true })).toBeFocused();
});
