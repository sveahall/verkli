import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
async function proposal(page: Page, alt: string) {
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: "navy" } }).png().toBuffer();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({ name: "boat.png", mimeType: "image/png", buffer: bytes });
  await page.getByRole("textbox", { name: "Alternative text", exact: true }).fill(alt);
  await page.getByLabel("Style name", { exact: true }).fill("Ink & sea");
  await page.getByLabel("Medium", { exact: true }).fill("Ink drawing");
  await page.getByLabel("Palette", { exact: true }).fill("Navy and warm paper");
}
test.beforeEach(async ({ page }) => {
  await page.goto("/dev/illustration-candidates");
  await expect(page.getByRole("heading", { name: "Image candidates", exact: true })).toBeVisible();
  const consent = page.getByRole("button", { name: "Essential only" }); await expect(consent).toBeVisible(); await consent.click();
});
test("preserves earlier candidates and local proposal after failure, then labels stale sources", async ({ page }, testInfo) => {
  await expect(page.getByText("No saved image candidates yet.", { exact: false })).toBeVisible();
  await proposal(page, "First harbour image");
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "Saved image candidate" })).toBeVisible();
  await page.getByRole("textbox", { name: "Alternative text", exact: true }).fill("Second harbour image");
  await page.getByRole("button", { name: "Fail next save", exact: true }).click();
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your local proposal is still here" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Alternative text", exact: true })).toHaveValue("Second harbour image");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: "Advance text version", exact: true }).click();
  await page.getByRole("button", { name: "Reload candidates", exact: true }).click();
  await expect(page.getByText("Based on older text", { exact: false })).toHaveCount(2);
  await page.getByRole("button", { name: "Use current text version", exact: true }).click();
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("candidates.png"), fullPage: true });
});
test("ignores a late save response after changing chapter", async ({ page }) => {
  await proposal(page, "Old chapter proposal"); await page.getByLabel("Delay saves", { exact: true }).check();
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving candidate…", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Demo chapter", exact: true }).selectOption("1");
  await expect(page.getByRole("heading", { name: "Across the water", exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Alternative text", exact: true })).toHaveValue("");
  await expect(page.getByRole("status").filter({ hasText: "Saved image candidate" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Demo chapter", exact: true }).selectOption("0");
  await expect(page.getByRole("article")).toHaveCount(1);
});
test("keeps retry identity when a replacement image fails to decode", async ({ page }) => {
  await proposal(page, "Preserved proposal");
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Image file", { exact: true }).setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken image bytes") });
  await expect(page.getByRole("alert").filter({ hasText: "could not be read" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Alternative text", exact: true })).toHaveValue("Preserved proposal");
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved image candidate" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
});
test("reconciles a lost save response after a rejected replacement and newer chapter", async ({ page }) => {
  await proposal(page, "Uncertain proposal");
  await page.getByRole("button", { name: "Lose next save response", exact: true }).click();
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not confirm the save" })).toBeVisible();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
  await expect(page.getByRole("alert").filter({ hasText: "could not be read" })).toBeVisible();
  await page.getByRole("button", { name: "Advance text version", exact: true }).click();
  await page.getByRole("button", { name: "Reload candidates", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Use current text version", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save image candidate", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved image candidate" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article").getByText("Based on older text", { exact: false })).toContainText("version 4");
});
