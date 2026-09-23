import { expect, test } from "@playwright/test";

test("recovery preserves content, blocks stale restores and isolates accounts", async ({ page }, testInfo) => {
  await page.goto("/dev/book-recovery");
  await page.getByRole("button", { name: "Essential only" }).click();
  await expect(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
  const book = page.getByRole("button", { name: /^book .*The lighthouse/i });
  await book.click();
  await expect(page.getByText("A synthetic manuscript about a lighthouse.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recovery-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "Simulate concurrent edit" }).click();
  await page.getByRole("button", { name: "Confirm restore as draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("changed in another session");
  await page.getByRole("button", { name: "Reload trash" }).click();
  await book.click();
  await page.getByRole("button", { name: "Confirm restore as draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "restored as a private draft" })).toBeVisible();
  await page.getByRole("button", { name: /chapter .*The keeper/i }).click();
  await expect(page.getByText("The lighthouse keeper opened the door.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm restore as draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The keeper" })).toBeVisible();
  await page.getByRole("button", { name: /chapter .*Earlier opening/i }).click();
  await page.getByRole("button", { name: "Confirm restore as draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("position");
  await page.getByRole("button", { name: "Account: owner" }).click();
  await expect(page.getByRole("heading", { name: "Your trash is empty" })).toBeVisible();
  await expect(page.getByText("Earlier opening", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Account: other author" }).click();
  await page.getByRole("button", { name: "Service failure: off" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Could not load");
  await page.getByRole("button", { name: "Service failure: on" }).click();
  await expect(page.getByRole("button", { name: /chapter .*Earlier opening/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("cover downloads real PNG and JPEG files and retains edits on save failure", async ({ page }, testInfo) => {
  await page.goto("/dev/cover-editor");
  await page.getByRole("button", { name: "Essential only" }).click();
  await page.getByLabel("Simulate save failure").check();
  await page.getByRole("button", { name: "Open cover editor" }).click();
  await expect(page.getByRole("button", { name: "Save cover" })).toBeEnabled();
  for (const label of ["Save cover", "Close cover editor", "Download copy"]) {
    const rect = await page.getByRole("button", { name: label, exact: true }).boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await page.screenshot({ path: testInfo.outputPath("cover-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "Title", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox").fill("Edited lighthouse");
  for (const format of ["png", "jpeg"]) {
    await page.getByLabel("Export format").selectOption(format);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download copy" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`cover-edited.${format === "jpeg" ? "jpg" : "png"}`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, format === "png" ? 8 : 3).toString("hex")).toBe(format === "png" ? "89504e470d0a1a0a" : "ffd8ff");
  }
  await page.getByRole("button", { name: "Save cover" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Your edits are still here");
  await expect(page.getByRole("button", { name: "Edited lighthouse", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("verkli_cover_editor_local-cover-export-fixture"))).toBeNull();
  await expect(page.getByRole("button", { name: "Save cover" })).toBeEnabled();
  await page.getByRole("button", { name: "Close cover editor" }).click();
  await page.getByLabel("Simulate save failure").uncheck();
  await page.getByRole("button", { name: "Open cover editor" }).click();
  await page.getByRole("button", { name: "Save cover" }).click();
  await expect(page.getByRole("status")).toContainText("Simulated save");
  await page.getByLabel("Simulate missing image").check();
  await page.getByRole("button", { name: "Open cover editor" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Could not load the cover image");
  await expect(page.getByRole("button", { name: "Save cover" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download copy" })).toBeDisabled();
});
