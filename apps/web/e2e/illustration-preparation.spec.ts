import { expect, test, type Download, type Page } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
async function imageFile(color = "#ee0000", width = 120, height = 80) {
  return { name: "source.png", mimeType: "image/png", buffer: await sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer() };
}
async function download(page: Page) {
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Download image", exact: true }).click();
  const result: Download = await pending; return readFile((await result.path())!);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/dev/illustration-preparation");
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Prepare an illustration", exact: true })).toBeVisible();
});
test("exports actual crop pixels, transparent PNG and white-background JPEG", async ({ page }, info) => {
  await expect(page.getByRole("button", { name: "Download image", exact: true })).toBeDisabled();
  const blue = await imageFile("#0000ee", 80, 80);
  const source = await sharp({ create: { width: 160, height: 80, channels: 4, background: "#ee0000" } }).composite([{ input: blue.buffer, left: 80, top: 0 }]).png().toBuffer();
  await page.getByLabel("Source image", { exact: true }).setInputFiles({ name: "two-colors.png", mimeType: "image/png", buffer: source });
  await page.getByRole("combobox", { name: "Crop shape", exact: true }).selectOption("square");
  await page.getByLabel("Horizontal position", { exact: true }).press("End");
  const png = await download(page); const meta = await sharp(png).metadata(); expect(meta.format).toBe("png"); expect(meta.width).toBe(80); expect(meta.height).toBe(80);
  const pixel = await sharp(png).extract({ left: 40, top: 40, width: 1, height: 1 }).raw().toBuffer(); expect(pixel[2]).toBeGreaterThan(220); expect(pixel[0]).toBeLessThan(15);
  const preview = await page.getByLabel("Cropped image preview", { exact: true }).evaluate((canvas) => [...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(40, 40, 1, 1).data]);
  expect([...pixel.slice(0, 3)]).toEqual(preview.slice(0, 3));
  await page.getByLabel("Source image", { exact: true }).setInputFiles(await imageFile("#00000000", 64, 48));
  await expect(page.getByText("64 × 48 px", { exact: true })).toBeVisible();
  const transparent = await download(page); const alpha = await sharp(transparent).ensureAlpha().raw().toBuffer(); expect(alpha[3]).toBe(0);
  await page.getByRole("combobox", { name: "Download format", exact: true }).selectOption("jpeg");
  const jpeg = await download(page); const jpegMeta = await sharp(jpeg).metadata(); expect(jpegMeta.format).toBe("jpeg"); expect(jpegMeta.width).toBe(64); expect(jpegMeta.height).toBe(48);
  const white = await sharp(jpeg).raw().toBuffer(); expect([...white.slice(0, 3)]).toEqual([255, 255, 255]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("preparation.png"), fullPage: true });
});
test("keeps the valid proposal after rejected replacement and retries failed encoding", async ({ page }) => {
  await page.getByLabel("Source image", { exact: true }).setInputFiles(await imageFile());
  await expect(page.getByText("120 × 80 px", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Crop shape", exact: true }).selectOption("square");
  await page.getByLabel("Source image", { exact: true }).setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
  await expect(page.getByText("The image could not be read. Choose another PNG or JPEG.", { exact: true })).toBeVisible(); await expect(page.getByRole("combobox", { name: "Crop shape", exact: true })).toHaveValue("square");
  await page.evaluate(() => { const original = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (callback, ...args) { HTMLCanvasElement.prototype.toBlob = original; callback(null); void args; }; });
  await page.getByRole("button", { name: "Download image", exact: true }).click(); await expect(page.getByText("The image export failed. Try again or choose another format.", { exact: true })).toBeVisible();
  const result = await download(page); expect((await sharp(result).metadata()).width).toBe(80);
  await page.getByRole("button", { name: "Reset crop", exact: true }).click(); await expect(page.getByRole("combobox", { name: "Crop shape", exact: true })).toHaveValue("original");
});

test("uses browser JPEG orientation and ignores a replaced pending decode", async ({ page }) => {
  const blue = await imageFile("#0000ee", 80, 80);
  const oriented = await sharp({ create: { width: 160, height: 80, channels: 3, background: "#ee0000" } }).composite([{ input: blue.buffer, left: 80, top: 0 }]).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();
  await page.getByLabel("Source image", { exact: true }).setInputFiles({ name: "oriented.jpg", mimeType: "image/jpeg", buffer: oriented });
  await expect(page.getByText("80 × 160 px", { exact: true })).toBeVisible();
  const result = await download(page); const top = await sharp(result).extract({ left: 40, top: 20, width: 1, height: 1 }).raw().toBuffer();
  expect(top[0]).toBeGreaterThan(220); expect(top[2]).toBeLessThan(20);
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!; let delay = true;
    Object.defineProperty(HTMLImageElement.prototype, "src", { ...descriptor, set(value: string) { if (delay && value.startsWith("blob:")) { delay = false; Object.assign(window, { __delayedPreparation: true }); setTimeout(() => descriptor.set!.call(this, value), 1000); } else descriptor.set!.call(this, value); } });
  });
  await page.getByLabel("Source image", { exact: true }).setInputFiles(await imageFile("#ee0000", 120, 60));
  await page.waitForFunction(() => (window as unknown as { __delayedPreparation?: boolean }).__delayedPreparation === true);
  await page.getByLabel("Source image", { exact: true }).setInputFiles(await imageFile("#0000ee", 60, 120));
  await expect(page.getByText("60 × 120 px", { exact: true })).toBeVisible();
  await page.waitForTimeout(1100); // Let the deliberately delayed old image event arrive.
  const latest = await download(page); const meta = await sharp(latest).metadata(); expect(meta.width).toBe(60); expect(meta.height).toBe(120);
  const pixel = await sharp(latest).raw().toBuffer(); expect(pixel[2]).toBeGreaterThan(220); expect(pixel[0]).toBeLessThan(20);
});
