import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = new URL(process.env.AUDIO_SYNC_QA_URL || "http://localhost:3214");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Language fixture QA is local-only");
const output = process.env.AUDIO_SYNC_QA_OUTPUT || "/tmp/verkli-audio-language-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const checks = [];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(new URL("/dev/audiobook-preview", base).href);
  await page.getByRole("button", { name: "Preview voice", exact: true }).waitFor();
  const essential = page.getByRole("button", { name: "Essential only", exact: true });
  if (await essential.isVisible()) await essential.click();
  for (const [language, label] of [["nl", "Dutch"], ["pl", "Polish"]]) {
    await page.getByLabel("Selected edition").selectOption(language);
    await page.getByText(`Text only: ${label} audio is not available yet. You can continue writing and translating this edition.`, { exact: true }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Preview voice", exact: true }).isDisabled());
    assert.ok(await page.getByRole("button", { name: "Audio unavailable for this language", exact: true }).isDisabled());
    assert.equal(await page.getByRole("button", { name: "Continue to payment", exact: true }).count(), 0);
    checks.push(`${language} text-only copy and disabled preview/generation`);
  }
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  await page.getByLabel("Selected edition").selectOption("sv");
  assert.ok(await page.getByRole("button", { name: "Preview voice", exact: true }).isEnabled());
  assert.ok(await page.getByRole("button", { name: "Generate audiobook", exact: true }).isEnabled());
  checks.push("Swedish preview and generation remain enabled; 390px without overflow");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", checks, fixtureOnly: true }, null, 2));
  console.log(checks);
} finally { await browser.close(); }
