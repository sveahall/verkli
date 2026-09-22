import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = new URL(process.env.AUDIO_SYNC_QA_URL || "http://localhost:3214");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Audio fixture QA is local-only");
const output = process.env.AUDIO_SYNC_QA_OUTPUT || "/tmp/verkli-audio-sync-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(15_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
async function expectWord(word) {
  await page.waitForFunction((expected) => {
    const h = CSS.highlights?.get("reader-audio-word");
    return (h ? Array.from(h, (r) => r.toString()).join("") : "") === expected;
  }, word);
}
async function seek(seconds) {
  await page.locator("audio").evaluate(async (audio, value) => {
    if (!audio.readyState) {
      const loaded = new Promise((resolve) => audio.addEventListener("loadedmetadata", resolve, { once: true }));
      audio.load(); await loaded;
    }
    audio.currentTime = value;
  }, seconds);
}
async function record(name, callback) { await callback(); checks.push(name); console.log(`PASS ${name}`); }
try {
  await page.goto(new URL("/dev/audio-sync", base).href);
  await page.locator("[data-audio-sync-text] .ProseMirror").waitFor();
  const essential = page.getByRole("button", { name: "Essential only", exact: true });
  if (await essential.isVisible()) await essential.click();
  await record("actual media seek highlights exact word and clears gaps", async () => {
    await seek(4.5); await expectWord("two");
    await seek(1.5); await expectWord("One");
    await seek(3); await expectWord("");
    await seek(7.5); await expectWord("three.");
  });
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  await record("media playback and rate changes use currentTime", async () => {
    await page.getByLabel("Playback speed").selectOption("2");
    await seek(0.9);
    await page.locator("audio").evaluate((audio) => audio.play());
    await expectWord("One");
    await page.locator("audio").evaluate((audio) => audio.pause());
    assert.equal(await page.locator("audio").evaluate((audio) => audio.playbackRate), 2);
  });
  await record("chapter and edition switches clear old timing", async () => {
    await page.getByLabel("Chapter / edition").selectOption("second");
    await expectWord(""); await seek(4.5); await expectWord("five");
    await page.getByLabel("Chapter / edition").selectOption("swedish");
    await expectWord(""); await seek(7.5); await expectWord("tre.");
  });
  await record("resume seeks before highlighting", async () => {
    await page.getByRole("checkbox", { name: "Resume at 7.5 seconds" }).check();
    await page.locator("audio").evaluate((audio) => { if (!audio.readyState) audio.load(); });
    await expectWord("tre.");
    assert.ok(Math.abs(await page.locator("audio").evaluate((audio) => audio.currentTime) - 7.5) < 0.1);
  });
  await record("missing and stale text keep playable honest unsynced state", async () => {
    await page.getByLabel("Timing", { exact: true }).selectOption("missing");
    await page.getByText("Audio plays without synchronized text.", { exact: true }).waitFor();
    await seek(4.5); await expectWord("");
    await page.getByLabel("Timing", { exact: true }).selectOption("mismatch");
    await seek(4.5); await expectWord("");
    await page.getByText("Text highlighting is unavailable for this text or browser. Audio is still available.", { exact: true }).waitFor();
  });
  await record("late previous chapter response does not resurrect old playback", async () => {
    await page.getByLabel("Timing", { exact: true }).selectOption("delayed");
    await page.getByLabel("Chapter / edition").selectOption("first");
    await page.getByLabel("Chapter / edition").selectOption("second");
    await page.locator("audio").waitFor();
    await seek(4.5); await expectWord("five");
  });
  await record("removed title crossing a segment disables sync while audio plays", async () => {
    await page.getByRole("checkbox", { name: "Resume at 7.5 seconds" }).uncheck();
    await page.getByLabel("Chapter / edition").selectOption("first");
    await page.getByLabel("Timing", { exact: true }).selectOption("title-crossing");
    await seek(1.5); await expectWord("");
    await page.getByText("Text highlighting is unavailable for this text or browser. Audio is still available.", { exact: true }).waitFor();
    await page.locator("audio").evaluate((audio) => audio.play());
    await page.waitForFunction(() => document.querySelector("audio").currentTime > 1.7);
    await page.locator("audio").evaluate((audio) => audio.pause());
    await seek(4.5); await expectWord("");
    await page.screenshot({ path: path.join(output, "title-crossing.png"), fullPage: true });
  });
  await record("removed title between segments preserves the first visible word", async () => {
    await page.getByLabel("Timing", { exact: true }).selectOption("title-boundary");
    await seek(1.5); await expectWord("");
    await seek(4.5); await expectWord("One");
    await page.getByText("Text follows the audio.", { exact: true }).waitFor();
  });
  await record("load error displays retry without fabricated audio", async () => {
    await page.getByLabel("Timing", { exact: true }).selectOption("error");
    await page.getByRole("button", { name: "Retry audio", exact: true }).waitFor();
    assert.equal(await page.locator("audio").count(), 0);
    await expectWord("");
  });
  await page.getByLabel("Timing", { exact: true }).selectOption("timed");
  await page.getByLabel("Chapter / edition").selectOption("second");
  await page.setViewportSize({ width: 390, height: 844 });
  await seek(4.5); await expectWord("five");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  checks.push("390px viewport without overflow");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", checks, browser: browser.version(), fixtureOnly: true }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "FAIL", checks, error: String(error), errors }, null, 2));
  throw error;
} finally { await browser.close(); }
