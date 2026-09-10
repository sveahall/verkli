import { expect, test } from "@playwright/test";

// These checks exercise shared chrome and form behavior across the rebrand.
// They never submit account, waitlist, payment or content changes.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("verkli-cookie-consent", "declined");
    localStorage.setItem("verkli-theme", "light");
  });
});

test("theme control is accessible and changes both the page and navigation", async ({ page }) => {
  await page.goto("/author");
  const toggle = page.getByRole("button", { name: "Switch to dark mode" });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  // Navigation must remain readable after switching; inherited foreground
  // colours used to leave dark links against the dark navigation surface.
  const pricing = page.locator("nav").getByRole("link", { name: "Pricing", exact: true }).first();
  await expect.poll(async () => pricing.evaluate((node) => {
    const values = getComputedStyle(node).color.match(/[\d.]+/g)?.map(Number) ?? [];
    return values.slice(0, 3).every((value) => value > 150);
  })).toBe(true);
});

test("mobile navigation opens, follows a link and fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/author");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const pricing = page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Pricing", exact: true });
  await pricing.click();
  await expect(page).toHaveURL(/\/pricing/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("password visibility is keyboard operable and sign-up keeps the destination", async ({ page }) => {
  await page.goto("/reader/signin?next=%2Freader%2Flibrary");
  const password = page.locator('input[type="password"]');
  await password.fill("local-preview-only");
  await password.focus();
  await page.keyboard.press("Tab");
  const show = page.getByRole("button", { name: "Show password", exact: true });
  await expect(show).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('input[value="local-preview-only"]')).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(page.locator('input[value="local-preview-only"]')).toHaveAttribute("type", "password");
  await expect(page.getByRole("link", { name: "Create one" })).toHaveAttribute("href", /next=%2Freader%2Flibrary/);
  await page.getByRole("link", { name: "Create one" }).click();
  await expect(page).toHaveURL(/\/reader\/signup\?next=%2Freader%2Flibrary/);
});

test("public form pages retain usable labels and no narrow-screen overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/author/signup", "/reader/forgot-password", "/support", "/waitlist"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const email = page.locator('input[type="email"]').first();
    await expect(email).toBeVisible();
    await expect(email).toHaveAccessibleName(/email|e-post/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
});
