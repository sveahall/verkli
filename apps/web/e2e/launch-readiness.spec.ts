import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("verkli-cookie-consent", "declined"));
});

test("unsigned Stripe callbacks reach signature verification, not the beta wall", async ({ request }) => {
  const response = await request.post("/api/stripe/webhook", { data: {} });
  expect(response.status()).toBe(400);
  expect(await response.json()).not.toHaveProperty("error", "Beta access required");
});

test("worker monitoring reaches its own authentication and still denies anonymous access", async ({ request }) => {
  const response = await request.get("/api/health/workers");
  expect(response.status()).toBe(401);
  expect(await response.json()).not.toHaveProperty("error", "Beta access required");
});

test("signin footer links reach the actual privacy and terms pages during beta", async ({ page }) => {
  for (const [label, path] of [["Privacy", "/privacy"], ["Terms", "/terms"]]) {
    await page.goto("/author/signin");
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("public author navigation reaches product, pricing and FAQ without a beta invitation", async ({ page }) => {
  for (const path of ["/product", "/pricing", "/faq"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(path === "/product" ? "/author" : path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("support is available and will not submit an empty message", async ({ page }) => {
  await page.goto("/support");
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: /Your email/ })).toHaveAttribute("required", "");
});

test("the public support API validates requests without sending a message", async ({ request, baseURL }) => {
  const response = await request.post("/api/feedback", { data: {}, headers: { origin: baseURL! } });
  expect(response.status()).toBe(400);
  expect(await response.json()).not.toHaveProperty("error", "Beta access required");
});

test("missing access has a visible explanation and a working support link on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/waitlist?access=pending");
  const notice = page.getByRole("status").filter({ hasText: "This account is waiting for early access" });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("link", { name: "Use another account" })).toHaveAttribute("href", "/author/signin");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/verkli-launch-qa/screenshots/access-notice-mobile.png" });
  await notice.getByRole("link", { name: "Contact support" }).click();
  await expect(page).toHaveURL(/\/support$/);
});

test("a normal waitlist visit does not claim the visitor is signed in", async ({ page }) => {
  await page.goto("/waitlist");
  await expect(page.getByText("You’re signed in. This account is waiting for early access.")).toHaveCount(0);
});

test("the anonymous book delivery page never claims payment or exposes a download", async ({ page, request }) => {
  await page.goto("/order/ta-for-er/success");
  await expect(page.getByRole("heading", { name: "Beställningsstatus" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ladda ner/ })).toHaveCount(0);
  const response = await request.get("/api/order/ta-for-er/download");
  expect(response.status()).toBe(400);
});

test("private author and reader pages remain gated", async ({ page }) => {
  for (const path of ["/author/home", "/reader/library"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/waitlist$/);
  }
});
