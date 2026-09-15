/* Reads a local report; no API calls, signup or manuscript writes. */
(async () => {
  const { chromium, expect } = await import("@playwright/test");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const reportPath = process.env.EVALUATION_REPORT || path.resolve(__dirname, "../../../docs/qa/fixtures/translation-review-v2-2026-09-14.json");
  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.EVALUATION_QA_URL || "http://127.0.0.1:3024/dev/translation-evaluation");
    const consent = page.getByRole("button", { name: "Essential only", exact: true });
    await expect(consent).toBeVisible();
    await consent.click();
    await expect(page.locator('section[aria-labelledby="case-title"]').getByText("Not run", { exact: true })).toBeVisible();
    const cases = page.getByRole("navigation", { name: "Evaluation cases" }).getByRole("button");
    await expect(cases).toHaveCount(10);
    await cases.nth(1).focus(); await page.keyboard.press("Enter");
    await expect(cases.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Expected: flag a material issue" })).toBeVisible();
    const file = page.getByLabel("Load a local evaluation report");
    await page.getByRole("button", { name: "Load recorded model run", exact: true }).click();
    await expect(page.getByText(/Recorded model run/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "What the reviewers found" })).toBeVisible();
    await page.screenshot({ path: "/tmp/verkli-ai-evaluation-desktop.png", fullPage: true });
    const encode = (value) => ({ name: "report.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
    const first = report.results[0];
    await file.setInputFiles(encode({ ...report, results: [{ ...first, outcome: "error", review: null, errorCode: "REVIEW_FAILED" }] }));
    await cases.first().click();
    await expect(page.getByText("Review failed", { exact: true })).toBeVisible();
    await expect(page.getByText(/The review failed. No quality decision was made/)).toBeVisible();
    await cases.last().click(); await expect(page.locator('section[aria-labelledby="case-title"]').getByText("Not run", { exact: true })).toBeVisible();
    await file.setInputFiles(encode({ ...report, corpusFingerprint: "wrong-corpus" }));
    await expect(page.getByRole("region", { name: "Evaluation report", exact: true }).getByRole("alert")).toContainText("Cannot load this report");
    await expect(page.getByText(/Recorded model run/)).toHaveCount(0);
    await file.setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not JSON") });
    await expect(page.getByRole("region", { name: "Evaluation report", exact: true }).getByRole("alert")).toContainText("Cannot load this report");
    await file.setInputFiles(reportPath); await cases.nth(1).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(page.getByRole("heading", { name: "What the reviewers found" })).toBeVisible();
    await page.screenshot({ path: "/tmp/verkli-ai-evaluation-mobile.png", fullPage: true });
    expect(errors).toEqual([]);
    console.log("PASS: cases, keyboard, real report, evidence, failed/unrun distinction, invalid and mismatched report reset, mobile overflow and zero page errors.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
