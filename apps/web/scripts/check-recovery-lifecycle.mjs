// Focused browser regression. Uses existing esbuild/Playwright; no app server,
// network, credentials or database. Run with node >=22.12 from any directory.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { build } = require("esbuild");
const { chromium } = require("playwright");
const result = await build({ stdin: { contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import RecoveryPanel from './apps/web/src/features/book-recovery/RecoveryPanel';
const root=createRoot(document.getElementById('root'));
const item=(title)=>({id:title,kind:'book',title,bookTitle:title,edition:'en',deletedAt:'2026-09-22',revision:1,preview:'Synthetic text'});
window.renderAdapter=(adapter)=>root.render(<RecoveryPanel adapter={adapter}/>);
window.pending=(name)=>window.renderAdapter({list:async()=>[item(name)],restore:()=>new Promise((resolve,reject)=>{window[name]={resolve,reject}})});
window.success=()=>{let restored=false;window.renderAdapter({list:async()=>restored?[]:[item('Private A')],restore:async()=>{restored=true}})};
window.empty=()=>window.renderAdapter({list:async()=>[],restore:async()=>{}});
window.slowList=()=>window.renderAdapter({list:()=>new Promise(resolve=>window.finishList=()=>resolve([item('Old list')])),restore:async()=>{}});
`, resolveDir: fileURLToPath(new URL("../../../", import.meta.url)), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic" });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true });
let failures = 0;
async function scenario(name, run) {
  const page = await browser.newPage();
  try {
    await page.route("**/*", (route) => route.abort());
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await run(page);
    console.log(`PASS ${name}`);
  } catch (error) { failures += 1; console.error(`FAIL ${name}: ${error.message}`); }
  finally { await page.close(); }
}
const row = (page, name) => page.getByRole("button", { name: new RegExp(`book .*${name}`) });
async function begin(page, name) {
  await page.evaluate((value) => window.pending(value), name);
  await row(page, name).waitFor();
  assert.equal(await row(page, name).isEnabled(), true, `new adapter ${name} is locked by prior restore`);
  await row(page, name).click();
  await page.getByRole("button", { name: "Confirm restore as draft" }).click();
  await page.getByRole("button", { name: "Restoring…" }).waitFor();
}
try {
  for (const outcome of ["resolve", "reject"]) {
    await scenario(`old ${outcome} cannot lock or unlock a new adapter`, async (page) => {
      await begin(page, "A");
      await begin(page, "B");
      await page.evaluate((method) => window.A[method](method === "reject" ? new Error("Old failure") : undefined), outcome);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      assert.equal(await page.getByRole("button", { name: "Restoring…" }).isDisabled(), true, "old finally unlocked B");
      assert.equal(await row(page, "B").isDisabled(), true, "old finally unlocked B selection");
      assert.equal(await page.getByText("Old failure", { exact: true }).count(), 0);
      await page.evaluate(() => window.B.resolve());
      await page.getByText(/“B” restored as a private draft/).waitFor();
      assert.equal(await page.getByText(/“A” restored/).count(), 0);
      await row(page, "B").waitFor();
      assert.equal(await row(page, "B").isEnabled(), true, "B did not unlock itself");
    });
  }
  await scenario("notice survives same-adapter reload but not adapter replacement", async (page) => {
    await page.evaluate(() => window.success());
    await row(page, "Private A").click();
    await page.getByRole("button", { name: "Confirm restore as draft" }).click();
    await page.getByText(/Private A.*restored/).waitFor();
    await page.getByRole("button", { name: "Reload trash" }).click();
    await page.getByRole("heading", { name: "Your trash is empty" }).waitFor();
    assert.equal(await page.getByText(/Private A.*restored/).count(), 1);
    await page.evaluate(() => window.empty());
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.getByRole("heading", { name: "Your trash is empty" }).waitFor();
    assert.equal(await page.getByText(/Private A.*restored/).count(), 0, "old adapter notice leaked");
  });
  await scenario("late list cannot repopulate a new adapter", async (page) => {
    await page.evaluate(() => window.slowList());
    await page.getByText("Loading removed manuscripts…").waitFor();
    await page.evaluate(() => window.pending("B"));
    await row(page, "B").waitFor();
    await page.evaluate(() => window.finishList());
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await row(page, "Old list").count(), 0);
    assert.equal(await row(page, "B").count(), 1);
  });
} finally { await browser.close(); }
if (failures) process.exitCode = 1;
