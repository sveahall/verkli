import { expect, test } from "@playwright/test";
import sharp from "sharp";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); active.add(url); return url; };
    URL.revokeObjectURL = (url) => { active.delete(url); revoke(url); };
    Object.assign(window, { illustrationUrls: active });
  });
  await page.goto("/dev/book-illustrations");
  await expect(page.getByRole("heading", { name: "Chapter illustrations", exact: true })).toBeVisible();
  const consent = page.getByRole("button", { name: "Essential only" });
  if (await consent.isVisible()) await consent.click();
});
const file = async (name = "harbour.png") => ({ name, mimeType: "image/png", buffer: await sharp({ create: { width: 800, height: 600, channels: 3, background: "#345b67" } }).png().toBuffer() });

test("approve, reject and failed replacement preserve the original illustration and text", async ({ page }, info) => {
  await expect(page.getByRole("heading", { name: "Chapter illustrations", exact: true })).toBeVisible();
  await expect(page.getByText("Local demo — not saved to a real book.", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("harbour");
  await page.getByRole("combobox", { name: "Style profile", exact: true }).selectOption("ink");
  await page.getByRole("combobox", { name: "Placement", exact: true }).selectOption("half-page");
  await page.getByLabel("Local image").setInputFiles(await file());
  await expect(page.getByRole("button", { name: "Approve demo preview" })).toBeDisabled();
  await page.getByLabel("Alternative text").fill("A boat beside the harbour");
  await expect(page.getByRole("img", { name: "A boat beside the harbour" })).toBeVisible();
  await expect(page.getByText("800 × 600 pixels")).toBeVisible();
  await page.screenshot({ path: info.outputPath("illustrations-candidate.png"), fullPage: true });
  await page.getByRole("button", { name: "Approve demo preview" }).click();
  const approved = page.getByRole("region", { name: "Approved demo preview", exact: true });
  await expect(approved.getByRole("img", { name: "A boat beside the harbour" })).toBeVisible();
  await page.getByLabel("Local image").setInputFiles(await file("replacement.png"));
  await page.getByLabel("Alternative text").fill("Replacement boat");
  await page.getByRole("button", { name: "Discard proposal" }).click();
  await expect(approved.getByRole("img", { name: "A boat beside the harbour" })).toBeVisible();
  await page.getByLabel("Local image").setInputFiles(await file("replacement.png"));
  await page.getByLabel("Alternative text").fill("Failed replacement");
  await page.getByLabel("Simulate approval failure").check();
  await page.getByRole("button", { name: "Approve demo preview" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic approval failure" })).toBeVisible();
  await expect(approved.getByRole("img", { name: "A boat beside the harbour" })).toBeVisible();
  await expect(page.getByLabel("Alternative text")).toHaveValue("Failed replacement");
  await expect(page.getByRole("complementary").getByText("Mara reached the harbour as the first fishing boats returned. She waited beside the old blue door.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { illustrationUrls: Set<string> }).illustrationUrls.size)).toBe(0);
});

test("late image results are discarded across chapter and profile changes; invalid files leave original", async ({ page }) => {
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("harbour");
  await page.getByRole("combobox", { name: "Style profile", exact: true }).selectOption("ink");
  await page.getByLabel("Hold image decoding").check();
  await page.getByLabel("Local image").setInputFiles(await file());
  await expect(page.getByText("Reading local image…")).toBeVisible();
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("island");
  await page.getByRole("button", { name: "Release images" }).click();
  await expect(page.getByRole("region", { name: "Proposed preview" }).getByRole("img")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { illustrationUrls: Set<string> }).illustrationUrls.size)).toBe(0);
  await page.getByLabel("Local image").setInputFiles(await file());
  await expect(page.getByText("Reading local image…")).toBeVisible();
  await page.getByRole("combobox", { name: "Style profile", exact: true }).selectOption("watercolour");
  await page.getByRole("button", { name: "Release images" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { illustrationUrls: Set<string> }).illustrationUrls.size)).toBe(0);
  await page.getByLabel("Hold image decoding").uncheck();
  await page.getByLabel("Local image").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert").filter({ hasText: "could not be read" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { illustrationUrls: Set<string> }).illustrationUrls.size)).toBe(0);
  await page.getByLabel("Local image").setInputFiles(await file());
  await expect(page.getByRole("region", { name: "Proposed preview" }).getByRole("img")).toBeVisible();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { illustrationUrls: Set<string> }).illustrationUrls.size)).toBe(0);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Chapter", exact: true })).toHaveValue("");
});
