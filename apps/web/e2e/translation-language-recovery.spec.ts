import { expect, test } from "@playwright/test";

test("explains missing source language and recovers without losing the original", async ({ page }) => {
  await page.goto("/dev/translation-quality");
  const alerts = page.getByRole("main").getByRole("alert");
  await page.getByRole("button", { name: "Book job flow", exact: true }).click();
  const original = page.getByRole("article", { name: "Original text" });
  await expect(original).toContainText("Natten var tyst.");

  await page.getByRole("button", { name: "Missing source language", exact: true }).click();
  await expect(alerts).toContainText("We couldn’t identify this edition’s language.");
  await expect(original).toContainText("Natten var tyst.");
  await page.getByRole("button", { name: "Retry preview", exact: true }).click();
  await expect(alerts).toContainText("saved chapters contain text");

  await page.getByRole("button", { name: "Translate book", exact: true }).click();
  await expect(alerts).toHaveCount(2);
  await expect(page.locator("body")).not.toContainText("SOURCE_LANGUAGE_MISSING");

  await page.getByText("Take your book further", { exact: true }).click();
  await page.getByRole("button", { name: "Translate selected languages", exact: true }).click();
  await expect(alerts.last()).toContainText("We couldn’t identify this edition’s language.");
  await expect(page.locator("body")).not.toContainText("SOURCE_LANGUAGE_MISSING");

  await page.getByRole("button", { name: "Checks passed", exact: true }).click();
  await expect(page.getByRole("article", { name: "English preview" })).toContainText("The night was quiet.");
  await page.getByRole("button", { name: "Translate book", exact: true }).click();
  await expect(alerts).toHaveCount(0);
  await expect(original).toContainText("Natten var tyst.");
});
