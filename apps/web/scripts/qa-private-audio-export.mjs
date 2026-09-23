import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
const expect = baseExpect.configure({ timeout: 20000 }), exec = promisify(execFile);
const base = new URL(process.env.PRIVATE_EXPORT_QA_URL || "http://127.0.0.1:3249");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Private export QA is synthetic and local-only");
const output = process.env.PRIVATE_EXPORT_QA_OUTPUT || "/tmp/verkli-private-export-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, acceptDownloads: true });
page.setDefaultTimeout(20000);
const checks = [], files = [], errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const create = page.getByRole("button", { name: "Create synthetic export", exact: true });
const scenario = page.getByRole("combobox", { name: "Source scenario", exact: true });
const alert = page.locator("main").getByRole("alert");
try {
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "RUNNING", startedAt: new Date().toISOString() }));
  await page.goto(new URL("/dev/private-audio-export", base).href, { timeout: 90000 });
  await expect(create).toBeVisible();
  const initialCookie = page.getByRole("button", { name: "Essential only", exact: true }); if (await initialCookie.isVisible()) await initialCookie.click();
  await expect(page.getByRole("complementary", { name: "Initial export limits", exact: true })).toContainText("5 minutes 49 seconds");
  for (const [format, label, extension, codec] of [["mp3-128", "MP3 · 128 kbps", "mp3", "mp3"], ["mp3-320", "MP3 · 320 kbps", "mp3", "mp3"], ["m4b", "M4B · chaptered", "m4b", "aac"]]) {
    await page.getByRole("radio", { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).check();
    await create.click(); await expect(page.getByRole("link", { name: `Download ${extension.toUpperCase()}`, exact: true })).toBeVisible();
    const pending = page.waitForEvent("download"); await page.getByRole("link", { name: `Download ${extension.toUpperCase()}`, exact: true }).click();
    const downloaded = await pending; assert.match(downloaded.suggestedFilename(), new RegExp(`^audiobook-.*-${format}\\.${extension}$`));
    const target = path.join(output, downloaded.suggestedFilename()); await downloaded.saveAs(target); assert.equal(await downloaded.failure(), null);
    const bytes = await readFile(target), { stdout } = await exec("ffprobe", ["-v", "error", "-show_streams", "-show_chapters", "-show_format", "-of", "json", target]);
    const probe = JSON.parse(stdout), audio = probe.streams.filter((stream) => stream.codec_type === "audio");
    assert.equal(audio.length, 1); assert.equal(audio[0].codec_name, codec); assert.equal(probe.format.tags.title, "Synthetic export edition"); assert.equal(probe.format.tags.author, "Fixture author");
    if (format === "m4b") { assert.deepEqual(probe.chapters.map((chapter) => chapter.tags.title), ["Departure", "Arrival"]); assert.deepEqual(probe.chapters.map((chapter) => Number(chapter.start_time)), [0, 2]); assert.ok(Math.abs(Number(probe.chapters[1].end_time) - 5) < 0.0011); }
    else assert.equal(Number(audio[0].bit_rate), format === "mp3-320" ? 320000 : 128000);
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-i", target, "-f", "null", "-"]);
    files.push({ filename: downloaded.suggestedFilename(), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), chapters: probe.chapters.length }); checks.push(`${format}: real download from two synthetic stored chapters, format/metadata/full decode verified`);
  }
  const cookie = page.getByRole("button", { name: "Essential only", exact: true }); if (await cookie.isVisible()) await cookie.click();
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  for (const mode of ["missing", "denied", "wrong-edition", "smoke"]) {
    await scenario.selectOption(mode); await expect(alert).toBeVisible(); await expect(create).toHaveCount(0); await expect(page.getByRole("link", { name: /^Download / })).toHaveCount(0); checks.push(`${mode}: preview rejected without ready or download`);
  }
  for (const mode of ["hash", "stale", "read-error"]) {
    await scenario.selectOption(mode); await expect(create).toBeVisible(); await create.click(); await expect(alert).toBeVisible();
    await expect(page.getByRole("link", { name: /^Download / })).toHaveCount(0); await page.getByRole("button", { name: "Reload source", exact: true }).click(); await expect(create).toBeVisible(); checks.push(`${mode}: export rejected, no attachment, reload source recovers preview`);
  }
  await scenario.selectOption("complete"); await expect(create).toBeVisible(); await create.click(); await page.getByRole("button", { name: "Cancel export", exact: true }).click();
  await expect(page.getByText("Export cancelled. No download was published.", { exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: /^Download / })).toHaveCount(0); checks.push("cancellation does not publish a completed download");
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true }); checks.push("390px without overflow and visible technical limits");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", checks, files, syntheticOnly: true, realPrivateAssetReads: 0, browser: browser.version() }, null, 2)); console.log(`PASS ${checks.length} private export browser checks`);
} catch (error) {
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "FAIL", checks, files, errors, error: String(error) }, null, 2)); await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true, timeout: 5000 }).catch(() => {}); throw error;
} finally { await browser.close(); }
