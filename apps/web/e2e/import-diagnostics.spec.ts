import { expect, test } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
test.beforeEach(async ({ page }) => {
  await page.goto("/dev/import-diagnostics");
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
});
test("uses the author's exact reference for every admin status snapshot", async ({ page }) => {
  await page.getByRole("button", { name: "Author import status" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`Support reference: ${id}`)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Import reference", { exact: true }).fill(id);
  const panel = page.getByRole("region", { name: "Import diagnostics" });
  for (const state of ["queued", "extracting", "running", "completed", "failed"]) {
    await page.getByLabel("Fixture state").selectOption(state);
    await page.getByRole("button", { name: "Find import", exact: true }).click();
    await expect(panel.getByText(`Support reference: ${id}`)).toBeVisible();
    await expect(panel.locator("dd").first()).toContainText(({ queued: "Queued", extracting: "Extracting", running: "Processing", completed: "Completed", failed: "Failed" })[state]!);
  }
});
test("distinguishes absent queue, unavailable queue, conflict and lookup error", async ({ page }) => {
  await page.getByLabel("Import reference", { exact: true }).fill(id);
  const panel = page.getByRole("region", { name: "Import diagnostics" });
  for (const [state, expected] of [["missing", "No retained queue record"], ["unavailable", "Queue status unavailable"], ["mismatch", "The import and queue records disagree."], ["reverse-mismatch", "The import and queue records disagree."], ["error", "Import diagnostics are unavailable. Try again."]]) {
    await page.getByLabel("Fixture state").selectOption(state);
    await page.getByRole("button", { name: "Find import", exact: true }).click();
    await expect(panel.getByText(expected, { exact: !state.includes("mismatch") })).toBeVisible();
  }
});
test("clears previous results and ignores a slow lookup after the reference changes", async ({ page }) => {
  await page.getByLabel("Import reference", { exact: true }).fill(id);
  await page.getByRole("button", { name: "Delay next lookup" }).click();
  await page.getByRole("button", { name: "Find import", exact: true }).click();
  await expect(page.getByText("Loading import and queue status…")).toBeVisible();
  await page.getByLabel("Import reference", { exact: true }).fill("22222222-2222-4222-8222-222222222222");
  await page.getByRole("button", { name: "Find import", exact: true }).click();
  await expect(page.getByText("No import found for this reference.")).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(page.getByRole("region", { name: "Import diagnostics" }).getByText(`Support reference: ${id}`)).toHaveCount(0);
});
test("keeps the empty state and controls readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(/Enter an import reference to see its status/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Find import", exact: true })).toBeDisabled();
});
