import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/support-queue");
  await expect(page.getByText("106 items", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
});

test("pages and filters server results, and exposes reply identity", async ({ page }) => {
  await expect(page.getByText("reader1@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("Account email unavailable").first()).toBeVisible();
  await expect(page.getByText(/Reply to: guest@example.test/)).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 3", { exact: true })).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("new");
  await expect(page.getByText("36 items", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
});

test("saves only the selected row and refreshes filtered totals", async ({ page }) => {
  const first = page.locator("tbody tr").first();
  const second = page.locator("tbody tr").nth(1);
  await first.getByLabel("New status").selectOption("done");
  await expect(first.locator("span").filter({ hasText: /^New$/ })).toBeVisible();
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Status saved" })).toBeVisible();
  await expect(first.locator("span").filter({ hasText: /^Done$/ })).toBeVisible();
  await expect(second.locator("span").filter({ hasText: /^Triaged$/ })).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("new");
  await expect(page.getByText("35 items", { exact: true })).toBeVisible();
});

test("preserves loaded rows after a refresh failure with a stale warning and retry", async ({ page }) => {
  await page.getByRole("button", { name: "Fail next load", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("may be out of date");
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await expect(page.locator("tbody tr").first().getByLabel("New status")).toBeDisabled();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("requires reload after a conflict, then uses the newly loaded status", async ({ page }) => {
  const first = page.locator("tbody tr").first();
  await page.getByRole("button", { name: "Conflict next save", exact: true }).click();
  await first.getByLabel("New status").selectOption("done");
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("changed by another administrator");
  await expect(first.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reload queue", exact: true }).click();
  await expect(first.locator("span").filter({ hasText: /^Triaged$/ })).toBeVisible();
});

test("ignores a slower older page response after the filter changes", async ({ page }) => {
  await page.getByRole("button", { name: "Delay next load", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("done");
  await expect(page.getByText("35 items", { exact: true })).toBeVisible();
  // Deliberately wait for the superseded response to resolve.
  await page.waitForTimeout(1700);
  await expect(page.getByText("35 items", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr").first().locator("span").filter({ hasText: /^Done$/ })).toBeVisible();
});

test("does not claim success when saving fails", async ({ page }) => {
  const first = page.locator("tbody tr").first();
  await page.getByRole("button", { name: "Fail next save", exact: true }).click();
  await first.getByLabel("New status").selectOption("done");
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Status was not confirmed");
  await expect(first.locator("span").filter({ hasText: /^New$/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Status saved" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reload queue", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("shows a useful empty state", async ({ page }) => {
  await page.getByRole("button", { name: "Empty queue", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("No feedback yet", { exact: true })).toBeVisible();
});

test("fits mobile viewports and keeps controls at least 44 pixels high", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sizes = await page.locator("main button:visible, main select:visible").evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height));
  expect(sizes.every((height) => height >= 44)).toBe(true);
});
