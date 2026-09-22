import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const base = new URL(process.env.PRONUNCIATION_QA_URL || "http://localhost:3215");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Pronunciation QA is local-only");
const output = process.env.PRONUNCIATION_QA_OUTPUT || "/tmp/verkli-pronunciation-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.setDefaultTimeout(30_000);
const errors = [], checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const written = (n) => page.getByRole("textbox", { name: `Written form ${n}`, exact: true });
const spoken = (n) => page.getByRole("textbox", { name: `Spoken as ${n}`, exact: true });
const save = page.getByRole("button", { name: "Save in demo", exact: true });
const mode = page.getByLabel("Simulated response");
async function add(word, alias, n) { await page.getByRole("button", { name: "Add a pronunciation rule" }).click(); await written(n).fill(word); await spoken(n).fill(alias); }
async function record(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
try {
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "RUNNING", startedAt: new Date().toISOString() }));
  await page.goto(new URL("/dev/pronunciation", base).href, { timeout: 90_000 });
  const cookie = page.getByRole("button", { name: "Essential only", exact: true });
  if (await cookie.isVisible()) await cookie.click();
  await record("empty state and single-pass longest literal preview preserve manuscript", async () => {
    await expect(page.getByText("No saved rules for this edition", { exact: true })).toBeVisible();
    const manuscript = await page.getByTestId("manuscript-preview").textContent();
    await add("Mira", "Mira Bay", 1); await add("Mira Bay", "Meer-ah bay", 2);
    await expect(page.getByTestId("narration-preview")).toHaveText("Mira Bay arrived at Meer-ah bay. Mira Bay said, “Meet me at $x.”");
    assert.equal(await page.getByTestId("manuscript-preview").textContent(), manuscript);
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  });
  if (await cookie.isVisible()) await cookie.click();
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  await record("save and reload honestly use demo session only", async () => {
    await save.click(); await expect(page.getByText("Saved in this demo session only", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reload saved demo rules" }).click();
    await expect(written(1)).toHaveValue("Mira"); await expect(spoken(1)).toHaveValue("Mira Bay");
  });
  await record("failed save preserves draft and does not persist it", async () => {
    await mode.selectOption("save-error"); await spoken(1).fill("Unsaved alias"); await save.click();
    await expect(page.getByText(/The save was not confirmed/)).toBeVisible(); await expect(spoken(1)).toHaveValue("Unsaved alias");
    await mode.selectOption("normal"); await page.getByRole("button", { name: "Reload saved demo rules" }).click();
    await expect(spoken(1)).toHaveValue("Mira Bay");
  });
  await record("conflict preserves draft until explicit replacement", async () => {
    await spoken(1).fill("Keep this draft"); await mode.selectOption("conflict"); await save.click();
    await expect(page.getByText("Another change was saved. Your draft is still here.", { exact: true })).toBeVisible();
    await expect(spoken(1)).toHaveValue("Keep this draft"); await expect(save).toBeDisabled();
    await page.screenshot({ path: path.join(output, "conflict.png"), fullPage: true });
    await mode.selectOption("normal"); await page.getByRole("button", { name: "Load latest and replace draft" }).click();
    await expect(written(1)).toHaveValue("Bay"); await expect(spoken(1)).toHaveValue("Bey");
  });
  await record("late save remains bound to its original edition and owner", async () => {
    await spoken(1).fill("Late saved Bay"); await mode.selectOption("delayed"); await save.click();
    await page.getByLabel("Edition", { exact: true }).selectOption("sv");
    await expect(page.getByText("No saved rules for this edition", { exact: true })).toBeVisible();
    await expect(written(1)).toHaveCount(0);
    await mode.selectOption("normal"); await page.getByLabel("Edition", { exact: true }).selectOption("en");
    await expect(spoken(1)).toHaveValue("Late saved Bay");
    await page.getByLabel("Demo author").selectOption("author-two");
    await expect(page.getByText("No saved rules for this edition", { exact: true })).toBeVisible(); await expect(written(1)).toHaveCount(0);
  });
  await record("load error blocks editing and can be retried", async () => {
    await mode.selectOption("load-error"); await page.getByRole("button", { name: "Reload saved demo rules" }).click();
    await expect(page.getByText("Rules could not be loaded. Please retry before editing.", { exact: true })).toBeVisible();
    await expect(save).toBeDisabled();
    await mode.selectOption("normal"); await page.getByRole("button", { name: "Retry loading rules" }).click();
    await expect(page.getByText("No saved rules for this edition", { exact: true })).toBeVisible();
  });
  await record("remove all rules saves an explicit empty revision", async () => {
    await add("Mira", "Mee-ra", 1); await save.click(); await expect(save).toBeDisabled();
    await expect(page.getByText("Saved in this demo session only", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remove rule 1", exact: true }).click(); await save.click();
    await expect(page.getByText("Saved in this demo session only", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reload saved demo rules" }).click(); await expect(written(1)).toHaveCount(0);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await add("Mira", "Mee-ra", 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  checks.push("390px viewport without horizontal overflow");
  await page.reload(); await expect(page.getByText("No saved rules for this edition", { exact: true })).toBeVisible();
  checks.push("page refresh clears session-only fixture storage");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", checks, browser: browser.version(), fixtureOnly: true }, null, 2));
} catch (error) {
  await writeFile(path.join(output, "result.json"), JSON.stringify({ status: "FAIL", checks, errors, error: String(error) }, null, 2));
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true, timeout: 5000 }).catch(() => {}); throw error;
} finally { await browser.close(); }
