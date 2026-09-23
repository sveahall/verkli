import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const expect = baseExpect.configure({ timeout: 20000 });
const base = new URL(process.env.FULL_BOOK_EXPORT_QA_URL || "http://127.0.0.1:3250");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Synthetic local QA only");
const directory = process.env.FULL_BOOK_EXPORT_QA_OUTPUT || "/tmp/verkli-full-book-export-qa"; await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage(); const checks = [], errors = []; page.on("pageerror", (error) => errors.push(error.message));
const editionId = "00000000-0000-4000-8000-000000000003", id = "00000000-0000-4000-8000-000000000099";
let status = "processing";
const value = () => ({ editionId, snapshotId: null, metadata: null, sourceError: "The edited chapter has no matching audio.", chapterCount: 0, maxOutputBytes: 536870912, jobs: [{ id, editionId, format: "m4b", requestId: id, snapshotId: "a".repeat(64), status, phase: status === "cancelled" ? "Export cancelled" : "Source no longer current", progress: 20, message: "No download is available.", createdAt: new Date().toISOString(), durationSeconds: null, byteLength: null }] });
try {
  await page.route("**/api/dev/full-book-audio-export?**", async (route) => { if (route.request().method() === "DELETE") { status = "cancelled"; await route.fulfill({ json: value().jobs[0] }); } else await route.fulfill({ json: value() }); });
  await page.goto(new URL("/dev/full-book-audio-export", base).href, { timeout: 90000 });
  const cookie = page.getByRole("button", { name: "Essential only", exact: true }); await cookie.waitFor({ state: "visible", timeout: 10000 }); await cookie.click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Saved jobs remain available"); await expect(page.getByRole("button", { name: "Prepare full-book export", exact: true })).toHaveCount(0); checks.push("Invalid current audio hides creation but preserves saved job status");
  await page.getByRole("button", { name: "Cancel export", exact: true }).click(); await expect(page.locator(`[data-export-id="${id}"]`)).toContainText("cancelled"); await expect(page.getByRole("link", { name: /^Download / })).toHaveCount(0); checks.push("Saved job can be cancelled while current chapter audio is unavailable");
  await page.reload(); await expect(page.locator(`[data-export-id="${id}"]`)).toContainText("cancelled"); checks.push("Cancelled job remains visible on recovery reload");
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(directory, "source-recovery-mobile.png"), fullPage: true }); checks.push("Source recovery state fits mobile viewport");
  assert.deepEqual(errors, []); await writeFile(path.join(directory, "recovery-result.json"), JSON.stringify({ status: "PASS", checks, syntheticOnly: true, mockedHttp: true }, null, 2)); console.log(`PASS ${checks.length} source recovery browser checks`);
} finally { await browser.close(); }
