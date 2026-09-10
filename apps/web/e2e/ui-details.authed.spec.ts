import { expect, test } from "@playwright/test";

// Uses the existing fixture session. Notifications are intercepted; no user,
// publication, payment or notification mutations reach the real services.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("verkli-cookie-consent", "declined");
    localStorage.setItem("verkli-theme", "light");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/notifications**", (route) => route.fulfill({ status: 200, json: { count: 0, notifications: [] } }));
  await page.goto("/reader/discover");
});

test("account opens into its links and Escape restores trigger focus", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Account menu", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: "Account navigation" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("account panel stays inside a narrow viewport and closes on resize", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  const panel = page.getByRole("region", { name: "Account navigation" });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveCount(0);
});

test("notifications distinguish a failed load from an empty inbox and retry", async ({ page }) => {
  let fail = true;
  await page.route("**/api/notifications?limit=10", (route) => route.fulfill(fail ? {status:503,json:{error:"Unavailable"}} : {status:200,json:{notifications:[]}}));
  const trigger = page.getByRole("button", { name: /^Notifications/ });
  await trigger.click();
  const panel = page.getByRole("region", { name: "Notifications", exact: true });
  await expect(panel.getByRole("alert")).toContainText("Could not load notifications");
  await expect(panel.getByText("No notifications yet", { exact: true })).toHaveCount(0);
  fail = false;
  await panel.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(panel.getByText("No notifications yet", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("clicking the notification trigger again closes the panel", async ({ page }) => {
  const trigger = page.getByRole("button", { name: /^Notifications/ });
  const panel = page.getByRole("region", { name: "Notifications", exact: true });
  await trigger.click();
  await expect(panel).toBeVisible();
  await trigger.click();
  await expect(panel).toHaveCount(0);
});
