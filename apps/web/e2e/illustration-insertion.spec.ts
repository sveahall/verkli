import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const bookId = "11111111-1111-4111-8111-111111111111";
const editionId = "22222222-2222-4222-8222-222222222222";
const chapterId = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444";
const base = `/api/books/${bookId}/editions/${editionId}/chapters/${chapterId}/illustrations`;

async function network(page: Page) {
  await page.route("**/auth/v1/**", async (route) => { await route.fulfill({ json: { id: "66666666-6666-4666-8666-666666666666", aud: "authenticated", role: "authenticated", email: "synthetic@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-24T10:00:00Z" } }); });
  const state = { denyList: false, denyImage: false, delayList: 0, foreignScope: false };
  const png = await sharp({ create: { width: 24, height: 16, channels: 4, background: "#7456bd" } }).png().toBuffer();
  await page.route("**/api/**/illustrations**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/image")) {
      await route.fulfill({ status: state.denyImage ? 403 : 200, contentType: state.denyImage ? "application/json" : "image/png", body: state.denyImage ? '{}' : png }); return;
    }
    const delay = state.delayList;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (state.denyList) { await route.fulfill({ status: 403, json: { error: "FORBIDDEN" } }); return; }
    const currentChapter = url.pathname.split("/chapters/")[1].split("/")[0];
    const ownBase = `/api/books/${bookId}/editions/${editionId}/chapters/${currentChapter}/illustrations`;
    await route.fulfill({ json: { scope: { bookId, editionId: state.foreignScope ? id : editionId, chapterId: currentChapter, chapterVersion: 3, chapterTitle: "Synthetic chapter" }, candidates: currentChapter !== chapterId ? [] : [{ id, version: 1, createdAt: "2026-09-24T10:00:00Z", alt: "Saved forest", placement: "icon", styleSnapshot: { name: "Ink", medium: "Pen", palette: "Black" }, width: 24, height: 16, sourceChapterVersion: 1, imageUrl: `${ownBase}/${id}/image` }] } });
  });
  return state;
}
async function choose(page: Page) {
  await page.getByRole("button", { name: "Saved illustrations", exact: true }).click();
  await page.getByRole("combobox", { name: "Saved illustration", exact: true }).selectOption(id);
  await expect(page.getByRole("button", { name: "Insert into this chapter" })).toBeEnabled();
}

test("inserts into real editor, autosaves, undoes without losing prose, reloads and renders protected reader image", async ({ page }, info) => {
  await network(page); await page.goto("/dev/illustration-insertion"); await page.getByRole("button", { name: "Start synthetic author session" }).click();
  const editor = page.locator('.verkli-content [contenteditable="true"]');
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" My unsaved addition.");
  await choose(page);
  await page.getByRole("textbox", { name: "Image description", exact: true }).fill("Forest beside the river");
  await page.getByRole("button", { name: "Insert into this chapter" }).click();
  await expect(editor.locator("img")).toHaveAttribute("alt", "Forest beside the river");
  await expect(editor).toContainText("My unsaved addition.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("img")).toHaveCount(0); await expect(editor).toContainText("My unsaved addition.");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
  await page.reload(); await expect(editor.locator("img")).toHaveAttribute("src", `${base}/${id}/image`);
  await page.getByRole("button", { name: "Toggle reader preview" }).click();
  const readerImage = page.getByRole("region", { name: "Reader preview" }).locator("img");
  await expect(readerImage).toHaveAttribute("src", `${base.replace('/api/books/', '/api/reader/books/')}/${id}/image`);
  await expect(readerImage).toHaveJSProperty("naturalWidth", 24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator("main").evaluate((element) => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
  expect(await editor.evaluate((element) => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("insertion.png"), fullPage: true });
});

test("keeps manuscript and selection on permission failure and rejects foreign edition response", async ({ page }) => {
  const state = await network(page); await page.goto("/dev/illustration-insertion"); await page.getByRole("button", { name: "Start synthetic author session" }).click();
  await choose(page); state.denyImage = true;
  await page.getByRole("button", { name: "Insert into this chapter" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "could not be verified" })).toBeVisible();
  await expect(page.locator('.verkli-content img')).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Image description", exact: true })).toHaveValue("Saved forest");
  state.denyImage = false; await page.getByRole("button", { name: "Insert into this chapter" }).click();
  await expect(page.locator('.verkli-content img')).toHaveCount(1);
  state.foreignScope = true; await page.getByRole("button", { name: "Reload illustrations" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "response did not match" })).toBeVisible();
  await expect(page.locator('.verkli-content img')).toHaveCount(1);
});

test("ignores delayed list after chapter/account change", async ({ page }) => {
  const state = await network(page); await page.goto("/dev/illustration-insertion"); await page.getByRole("button", { name: "Start synthetic author session" }).click();
  state.delayList = 800;
  const pending = page.waitForRequest((request) => new URL(request.url()).pathname === base);
  await page.getByRole("button", { name: "Saved illustrations", exact: true }).click(); await pending;
  await page.getByRole("button", { name: "Switch chapter" }).click();
  state.delayList = 0;
  await page.getByRole("button", { name: "Saved illustrations", exact: true }).click();
  await expect(page.getByText("No saved illustrations for this chapter yet.", { exact: false })).toBeVisible();
  await page.waitForTimeout(900); await expect(page.getByRole("combobox", { name: "Saved illustration", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Switch chapter" }).click(); await choose(page);
  state.delayList = 800;
  const inserting = page.waitForRequest((request) => new URL(request.url()).pathname === base);
  await page.getByRole("button", { name: "Insert into this chapter" }).click(); await inserting;
  await page.getByRole("button", { name: "Switch account" }).click();
  await page.waitForTimeout(900); await expect(page.locator('.verkli-content img')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Insert into this chapter" })).toHaveCount(0);
});

test("hides loaded private images on real auth signout and restores only the original owner's draft", async ({ page }) => {
  await network(page); await page.goto("/dev/illustration-insertion");
  await page.getByRole("button", { name: "Start synthetic author session" }).click(); await choose(page);
  await page.getByRole("button", { name: "Insert into this chapter" }).click();
  await expect(page.locator('.verkli-content img')).toBeVisible();
  await page.getByRole("button", { name: "Switch account" }).click();
  await expect(page.locator('.verkli-content img')).toBeHidden();
  await expect(page.locator('.verkli-content')).toBeHidden();
  await expect(page.getByText("Verifying your author session.", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Start synthetic author session" }).click();
  await expect(page.locator('.verkli-content img')).toBeVisible();
});

test("holds debounced unsaved prose while signed out and saves it only after the same owner returns", async ({ page }) => {
  await network(page); await page.goto("/dev/illustration-insertion");
  await page.getByRole("button", { name: "Start synthetic author session" }).click();
  const editor = page.locator('.verkli-content [contenteditable="true"]');
  await editor.click(); await page.keyboard.press("End");
  const before = await page.getByTestId("save-count").textContent();
  await page.keyboard.type(" Pending original-owner text.");
  await page.getByRole("button", { name: "Switch account" }).click();
  await expect(editor).toBeHidden(); await page.waitForTimeout(700);
  await expect(page.getByTestId("save-count")).toHaveText(before!);
  await page.getByRole("button", { name: "Start synthetic author session" }).click();
  await expect(editor).toBeVisible(); await expect(editor).toContainText("Pending original-owner text.");
  await expect(page.getByTestId("save-count")).not.toHaveText(before!);
});


test("recovers a paused draft across chapter remount without writing it into another chapter", async ({ page }) => {
  await network(page); await page.goto("/dev/illustration-insertion");
  await page.getByRole("button", { name: "Start synthetic author session" }).click();
  const editor = page.locator('.verkli-content [contenteditable="true"]');
  await editor.click(); await page.keyboard.press("End");
  const before = await page.getByTestId("save-count").textContent();
  await page.keyboard.type(" Recover after chapter switch.");
  await page.getByRole("button", { name: "Switch account" }).click();
  await expect(editor).toBeHidden();
  await page.getByRole("button", { name: "Switch chapter" }).click();
  await page.waitForTimeout(700);
  await expect(page.getByTestId("save-count")).toHaveText(before!);
  await page.getByRole("button", { name: "Start synthetic author session" }).click();
  await expect(editor).toBeVisible(); await expect(editor).not.toContainText("Recover after chapter switch.");
  await page.getByRole("button", { name: "Switch chapter" }).click();
  await expect(editor).toContainText("Recover after chapter switch.");
  await expect(page.getByTestId("save-count")).not.toHaveText(before!);
  await page.reload(); await expect(editor).toContainText("Recover after chapter switch.");
});


test("keeps a recovered draft when saving fails and the author session cycles again", async ({ page }) => {
  await network(page); await page.goto("/dev/illustration-insertion");
  await page.getByRole("button", { name: "Start synthetic author session" }).click();
  await page.getByRole("button", { name: "Simulate failed save" }).click();
  const editor = page.locator('.verkli-content [contenteditable="true"]');
  await editor.click(); await page.keyboard.press("End"); await page.keyboard.type(" Keep failed recovery.");
  await page.getByRole("button", { name: "Switch account" }).click(); await expect(editor).toBeHidden();
  await page.getByRole("button", { name: "Switch chapter" }).click();
  await page.getByRole("button", { name: "Start synthetic author session" }).click();
  await page.getByRole("button", { name: "Switch chapter" }).click();
  await expect(editor).toContainText("Keep failed recovery."); await page.waitForTimeout(700);
  await expect(page.getByTestId("save-count")).toHaveText("0");
  await page.getByRole("button", { name: "Switch account" }).click(); await expect(editor).toBeHidden();
  await page.getByRole("button", { name: "Start synthetic author session" }).click();
  await expect(editor).toBeVisible(); await expect(editor).toContainText("Keep failed recovery.");
});
