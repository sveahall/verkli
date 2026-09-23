import { expect, test } from "@playwright/test";

test("Enter activates the command focused by Tab", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("verkli-cookie-consent", "declined"));
  await page.goto("/author/library");
  await page.getByRole("button", { name: "Open command palette", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Command palette", exact: true });
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: /Open analytics/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/author\/analytics(?:\?|$)/);
});

// Opens the existing fixture's command picker without creating a book.
test("Enter selects the hovered command rather than the last command", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("verkli-cookie-consent", "declined"));
  await page.goto("/author/home");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Search commands...")).toBeFocused();
  await page.getByRole("button", { name: /Create book Start a new draft or import a manuscript/ }).hover();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/author\/library\?action=create-book/, { timeout: 15_000 });
});
