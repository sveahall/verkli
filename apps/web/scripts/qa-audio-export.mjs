import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
const exec = promisify(execFile), expect = baseExpect.configure({ timeout: 20000 });
const base = new URL(process.env.AUDIO_EXPORT_QA_URL || "http://127.0.0.1:3247");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Audio export QA is local-only");
const output = process.env.AUDIO_EXPORT_QA_OUTPUT || "/tmp/verkli-audio-export-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1400, height: 1050 }, acceptDownloads: true });
page.setDefaultTimeout(30000);
const errors = [], checks = [], files = [];
page.on("pageerror", (error) => errors.push(error.message));
const create = page.getByRole("button", { name: "Create synthetic export", exact: true });
try {
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "RUNNING", startedAt: new Date().toISOString() }));
  await page.goto(new URL("/dev/audio-export", base).href, { timeout: 90000 });
  await expect(page.getByText("No export created yet.", { exact: true })).toBeVisible();
  for (const [format, label, extension, codec] of [["mp3-128", "MP3 · 128 kbps", "mp3", "mp3"], ["mp3-320", "MP3 · 320 kbps", "mp3", "mp3"], ["m4b", "M4B · chaptered", "m4b", "aac"]]) {
    await page.getByRole("radio", { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).check();
    await create.click(); await expect(page.getByText("Verified synthetic export ready.", { exact: true })).toBeVisible();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("link", { name: `Download ${extension.toUpperCase()}`, exact: true }).click();
    const file = await downloaded, expectedName = `synthetic-vagen-hem-${format}.${extension}`;
    assert.equal(file.suggestedFilename(), expectedName);
    const target = path.join(output, expectedName); await file.saveAs(target);
    assert.equal(await file.failure(), null);
    const bytes = await readFile(target); assert.ok(bytes.length > 1000);
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_streams", "-show_chapters", "-show_format", "-of", "json", target]);
    const probe = JSON.parse(stdout), audio = probe.streams.filter((stream) => stream.codec_type === "audio");
    assert.equal(audio.length, 1); assert.equal(audio[0].codec_name, codec); assert.equal(probe.format.tags.title, "Vägen hem");
    assert.equal(probe.format.tags.author, "Demo author"); assert.equal(probe.format.tags.narrator, "Synthetic tones"); assert.equal(probe.format.tags.language, "swe");
    if (format === "m4b") {
      assert.deepEqual(probe.chapters.map((chapter) => chapter.tags.title), ["Avfärd", "Över vattnet", "Återkomst"]);
      assert.deepEqual(probe.chapters.map((chapter) => Number(chapter.start_time)), [0, 2.25, 5.375]);
      assert.ok(Math.abs(Number(probe.chapters[2].end_time) - 9.875) < 0.0011);
    } else assert.equal(Number(audio[0].bit_rate), format === "mp3-320" ? 320000 : 128000);
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-i", target, "-map", "0:a:0", "-f", "null", "-"]);
    files.push({ filename: expectedName, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), codec, durationSeconds: Number(probe.format.duration), embeddedChapters: probe.chapters.length });
    checks.push(`${format} actual browser download, metadata and full decode`); console.log(`PASS ${format} download`);
  }
  const cookie = page.getByRole("button", { name: "Essential only", exact: true });
  if (await cookie.isVisible()) await cookie.click();
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  for (const scenario of ["missing", "encoder-error", "size-limit"]) {
    await page.getByLabel("Source scenario").selectOption(scenario); await create.click();
    await expect(page.getByText("Export failed. No download is available.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Download / })).toHaveCount(0);
    checks.push(`${scenario} leaves no false ready or downloadable file`);
  }
  await page.getByLabel("Source scenario").selectOption("complete"); await create.click();
  await page.getByRole("button", { name: "Cancel export", exact: true }).click();
  await expect(page.getByText("Export cancelled. No download was published.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Download / })).toHaveCount(0);
  checks.push("cancel never exposes a completed download");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  checks.push("390px viewport without overflow"); assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", checks, files, browser: browser.version(), syntheticOnly: true }, null, 2));
} catch (error) {
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "FAIL", checks, files, errors, error: String(error) }, null, 2));
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true, timeout: 5000 }).catch(() => {}); throw error;
} finally { await browser.close(); }
