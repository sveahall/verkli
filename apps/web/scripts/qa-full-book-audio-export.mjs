import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
const expect = baseExpect.configure({ timeout: 120000 }), exec = promisify(execFile);
const base = new URL(process.env.FULL_BOOK_EXPORT_QA_URL || "http://127.0.0.1:3250");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Full-book QA is synthetic and local-only");
const output = process.env.FULL_BOOK_EXPORT_QA_OUTPUT || "/tmp/verkli-full-book-export-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, acceptDownloads: true });
const checks = [], files = [], errors = []; page.on("pageerror", (error) => errors.push(error.message));
const create = page.getByRole("button", { name: "Prepare full-book export", exact: true });
async function start() {
  const response = page.waitForResponse((response) => response.url().includes("/api/dev/full-book-audio-export") && response.request().method() === "POST");
  await create.click(); const result = await response; assert.equal(result.status(), 202); return (await result.json()).id;
}
try {
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "RUNNING", startedAt: new Date().toISOString() }));
  await page.goto(new URL("/dev/full-book-audio-export", base).href, { timeout: 90000 }); await expect(create).toBeVisible();
  const cookie = page.getByRole("button", { name: "Essential only", exact: true }); if (await cookie.isVisible()) await cookie.click();
  await expect(page.getByRole("complementary", { name: "Export capacity" })).toContainText("500 chapters");
  for (const [format, label, extension] of [["mp3-128", "MP3 · 128 kbps", "mp3"], ["mp3-320", "MP3 · 320 kbps", "mp3"], ["m4b", "M4B · chaptered", "m4b"]]) {
    await expect(create).toBeEnabled(); await page.getByRole("radio", { name: label, exact: true }).check();
    const id = await start();
    if (format === "mp3-128") { await page.reload(); checks.push("Reload recovers the same saved job while processing"); }
    const article = page.locator(`[data-export-id="${id}"]`), download = article.getByRole("link", { name: `Download ${extension.toUpperCase()}`, exact: true });
    await expect(download).toBeVisible();
    const pending = page.waitForEvent("download"); await download.click(); const file = await pending, target = path.join(output, `${format}.${extension}`); await file.saveAs(target); assert.equal(await file.failure(), null);
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_streams", "-show_chapters", "-show_format", "-of", "json", target]); const probe = JSON.parse(stdout), audio = probe.streams.filter((stream) => stream.codec_type === "audio");
    assert.equal(audio.length, 1); assert.equal(audio[0].codec_name, format === "m4b" ? "aac" : "mp3"); assert.ok(Math.abs(Number(probe.format.duration) - 378) < 0.06); assert.equal(probe.format.tags.author, "Fixture author"); assert.equal(probe.format.tags.title, "A synthetic journey in 21 chapters");
    if (format === "m4b") { assert.equal(probe.chapters.length, 21); assert.deepEqual(probe.chapters.map((chapter) => Number(chapter.start_time)), Array.from({ length: 21 }, (_, index) => index * 18)); }
    else assert.equal(Number(audio[0].bit_rate), format === "mp3-320" ? 320000 : 128000);
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-i", target, "-f", "null", "-"], { timeout: 60000 });
    const frequencies = [];
    for (const chapter of [0, 10, 20]) {
      const { stdout: pcm } = await exec("ffmpeg", ["-v", "error", "-nostdin", "-i", target, "-ss", String(chapter * 18 + 1), "-t", "0.5", "-ar", "48000", "-ac", "1", "-f", "s16le", "pipe:1"], { encoding: "buffer" });
      let crossings = 0; for (let offset = 2; offset < pcm.length; offset += 2) if (pcm.readInt16LE(offset - 2) <= 0 && pcm.readInt16LE(offset) > 0) crossings++;
      const hz = crossings / (pcm.length / 2 / 48000); assert.ok(Math.abs(hz - (220 + chapter * 20)) <= 4); frequencies.push(hz);
    }
    const bytes = await readFile(target); files.push({ format, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), durationSeconds: Number(probe.format.duration), verifiedToneFrequencies: frequencies }); checks.push(`${format}: actual 378-second 21-chapter file, metadata, decoded end and audible ordering verified`);
  }
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  const cancelledId = await start(); const cancelled = page.locator(`[data-export-id="${cancelledId}"]`); await cancelled.getByRole("button", { name: "Cancel export", exact: true }).click(); await expect(cancelled).toContainText("cancelled"); await expect(cancelled.getByRole("link")).toHaveCount(0); checks.push("Cancellation persists and cannot present a ready attachment");
  await page.reload(); await expect(page.locator(`[data-export-id="${cancelledId}"]`)).toContainText("cancelled"); checks.push("Cancelled status survives page reload");
  for (const scenario of ["encoder-error", "source-changed"]) { await page.getByRole("combobox", { name: "Source scenario" }).selectOption(scenario); await expect(create).toBeEnabled(); const id = await start(); const article = page.locator(`[data-export-id="${id}"]`); await expect(article).toContainText("failed"); await expect(article.getByRole("link")).toHaveCount(0); checks.push(`${scenario}: saved failure without download`); }
  for (const scenario of ["missing", "denied"]) { await page.getByRole("combobox", { name: "Source scenario" }).selectOption(scenario); await expect(page.locator("main").getByRole("alert")).toBeVisible(); await expect(create).toHaveCount(0); await expect(page.getByRole("link", { name: /^Download / })).toHaveCount(0); checks.push(`${scenario}: no export before verified source ownership/completeness`); }
  await page.getByRole("combobox", { name: "Source scenario" }).selectOption("complete"); await expect(create).toBeVisible(); await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true }); checks.push("390px viewport has no horizontal overflow");
  assert.deepEqual(errors, []); await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", checks, files, syntheticOnly: true, realPrivateAssetReads: 0 }, null, 2)); console.log(`PASS ${checks.length} full-book export browser checks`);
} catch (error) { await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "FAIL", checks, files, errors, error: String(error) }, null, 2)); await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => undefined); throw error; }
finally { await browser.close(); }
