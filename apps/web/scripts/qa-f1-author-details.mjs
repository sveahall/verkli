/* Real component regressions; synthetic data and intercepted writes only. */
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:3051';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('F1 QA requires localhost.');
const output = process.env.QA_OUTPUT || '/tmp/verkli-f1-author-details';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

async function check(name, run) {
  if (process.env.QA_CASE && !name.includes(process.env.QA_CASE)) return;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Deny every external request and real API write before navigation.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || (url.pathname.startsWith('/api/') && route.request().method() !== 'GET')) return route.abort();
    return route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('verkli-cookie-consent', 'declined'));
  try {
    await page.goto(`${baseURL}/dev/book-workflow`);
    await page.getByRole('button', { name: 'F1 details', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Preview import', exact: true })).toBeVisible();
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      const state = window.__f1 = { mode: 'ok', reads: 0, posts: 0, writes: [], deferred: [], uploads: [], jobs: [] };
      window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
        if (url.pathname === '/api/books/imports') {
          state.reads++;
          if (state.mode === 'network') throw new TypeError('Failed to fetch');
          if (state.mode === 'http') return Response.json({ error: 'GENERIC_ERROR' }, { status: 500 });
          if (state.mode === 'defer') return new Promise(resolve => state.deferred.push(resolve)); // Deliberately ignores abort.
          return Response.json({ imports: state.jobs });
        }
        if (url.pathname === '/api/books/import') {
          state.posts++;
          state.writes.push(init.body.get('file').name);
          return new Promise(resolve => state.uploads.push(resolve));
        }
        if (url.pathname.startsWith('/rest/v1/')) {
          state.writes.push(JSON.parse(init.body));
          return Response.json([]);
        }
        return originalFetch(input, init);
      };
    });
    await run(page);
    expect(errors).toEqual([]);
    results.push({ name, result: 'PASS' });
    console.log(`${name}: PASS`);
  } catch (error) {
    results.push({ name, result: 'FAIL', error: error.message });
    console.error(`${name}: ${error.message}`);
    await page.screenshot({ path: path.join(output, `${name.replaceAll(/[^a-z0-9]+/gi, '-')}-failure.png`) });
  } finally { await page.close(); }
}
const openImport = page => page.getByRole('button', { name: 'Preview import', exact: true }).click();
async function attest(page) {
  const dialog = page.getByRole('dialog', { name: 'Import book', exact: true });
  for (const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.check();
  await dialog.getByRole('radio', { name: 'no', exact: true }).check();
}
async function drop(page, count = 1) {
  await page.locator('#import-file-input').evaluate((input, count) => {
    for (let i = 0; i < count; i++) {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['Synthetic manuscript'], `sample-${i}.txt`, { type: 'text/plain' }));
      input.parentElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }
  }, count);
}

try {
  await check('status recovery', async page => {
    await page.evaluate(() => { window.__f1.jobs = [{ id: 'job-1', file_name: 'active.txt', status: 'running', progress: 10, error: null, book_id: null, created_at: new Date().toISOString() }]; });
    await openImport(page);
    const dialog = page.getByRole('dialog', { name: 'Import book', exact: true });
    await expect(dialog.getByText('Running 10%', { exact: true })).toBeVisible();
    for (const mode of ['network', 'http']) {
      await page.evaluate(mode => { window.__f1.mode = mode; }, mode);
      await expect(dialog.getByRole('alert')).toContainText('Could not refresh import status', { timeout: 10000 });
      await expect(dialog.getByText('active.txt', { exact: true })).toBeVisible();
      await expect(dialog.getByText('No imports yet.', { exact: true })).toHaveCount(0);
      await page.evaluate(() => { window.__f1.mode = 'ok'; window.__f1.jobs[0].progress += 10; });
      await expect(dialog.getByRole('alert')).toHaveCount(0, { timeout: 10000 });
    }
    await expect(dialog.getByText('Running 30%', { exact: true })).toBeVisible();
  });
  await check('initial error and stale response', async page => {
    await page.evaluate(() => { window.__f1.mode = 'http'; });
    await openImport(page);
    const dialog = page.getByRole('dialog', { name: 'Import book', exact: true });
    await expect(dialog.getByRole('alert')).toContainText('Could not refresh import status');
    await expect(dialog.getByText('No imports yet.', { exact: true })).toHaveCount(0);
    await page.evaluate(() => { window.__f1.mode = 'defer'; });
    await dialog.getByRole('button', { name: 'Retry status', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__f1.deferred.length)).toBe(1);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__f1.mode = 'ok'; });
    await openImport(page);
    await expect(dialog.getByText('No imports yet.', { exact: true })).toBeVisible();
    await page.evaluate(() => window.__f1.deferred.shift()(Response.json({ imports: [{ id: 'stale', file_name: 'stale.txt', status: 'running' }] })));
    await expect(dialog.getByText('stale.txt', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  });
  await check('one upload and unlock', async page => {
    await openImport(page);
    await attest(page);
    await drop(page, 2);
    expect(await page.evaluate(() => window.__f1.posts)).toBe(1);
    await expect(page.getByText('Uploading...', { exact: true })).toBeVisible();
    await page.evaluate(() => window.__f1.uploads.shift()(Response.json({ error: 'GENERIC_ERROR' }, { status: 500 })));
    await expect(page.getByLabel('Choose a book file')).toBeEnabled();
    await page.getByLabel('Choose a book file').setInputFiles({ name: 'retry.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic manuscript') });
    await expect.poll(() => page.evaluate(() => window.__f1.posts)).toBe(2);
    await drop(page);
    expect(await page.evaluate(() => window.__f1.posts)).toBe(2);
    await page.evaluate(() => window.__f1.uploads.shift()(Response.json({ id: 'uploaded-1', status: 'pending' })));
    await expect(page.getByText('Import started. Your file will be processed shortly.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Choose a book file')).toBeDisabled();
    await attest(page);
    await drop(page);
    expect(await page.evaluate(() => window.__f1.posts)).toBe(3);
    expect(await page.evaluate(() => window.__f1.writes)).toEqual(['sample-0.txt', 'retry.txt', 'sample-0.txt']);
    await page.evaluate(() => window.__f1.uploads.shift()(Response.json({ id: 'uploaded-2', status: 'pending' })));
  });
  await check('slow status and terminal polling', async page => {
    await page.evaluate(() => { window.__f1.mode = 'defer'; });
    await openImport(page);
    const dialog = page.getByRole('dialog', { name: 'Import book', exact: true });
    await expect(dialog.getByText('Loading import status…', { exact: true })).toBeVisible();
    const reads = await page.evaluate(() => window.__f1.reads);
    // Cross a real polling interval while the first response is unresolved.
    await page.waitForTimeout(2800);
    expect(await page.evaluate(() => window.__f1.reads)).toBe(reads);
    await page.evaluate(() => window.__f1.deferred.shift()(Response.json({ imports: [] })));
    await expect(dialog.getByText('No imports yet.', { exact: true })).toBeVisible();
    await page.evaluate(() => { window.__f1.mode = 'ok'; });
    await attest(page);
    await drop(page);
    await page.evaluate(() => {
      window.__f1.jobs = [{ id: 'finished', file_name: 'sample-0.txt', status: 'failed', error: 'Synthetic import failure', book_id: null }];
      window.__f1.uploads.shift()(Response.json({ id: 'finished', status: 'pending' }));
    });
    await expect(dialog.getByText('Synthetic import failure', { exact: true })).toBeVisible({ timeout: 10000 });
    const finalReads = await page.evaluate(() => window.__f1.reads);
    await page.waitForTimeout(2800);
    expect(await page.evaluate(() => window.__f1.reads)).toBe(finalReads);
    // A completed/failed upload later falls outside the API's newest-20 window.
    await attest(page);
    await drop(page);
    await page.evaluate(() => {
      window.__f1.jobs = Array.from({ length: 20 }, (_, index) => ({ id: index === 0 ? 'latest' : `other-${index}`, file_name: `recent-${index}.txt`, status: 'completed', error: null, book_id: null }));
      window.__f1.uploads.shift()(Response.json({ id: 'latest', status: 'pending' }));
    });
    await expect(dialog.getByText('recent-0.txt', { exact: true })).toBeVisible({ timeout: 10000 });
    const settledReads = await page.evaluate(() => window.__f1.reads);
    await page.waitForTimeout(2800);
    expect(await page.evaluate(() => window.__f1.reads)).toBe(settledReads);
  });
  await check('price draft and explicit Free Paid', async page => {
    const price = page.getByLabel('Price in currency');
    const save = page.getByRole('button', { name: 'Save pricing', exact: true });
    const toggle = page.getByRole('switch', { name: 'Book free or paid', exact: true });
    await price.fill('');
    await expect(price).toHaveValue('');
    await expect(price).toBeFocused();
    await expect(save).toBeDisabled();
    await expect(toggle).toBeChecked();
    await price.fill('0');
    await expect(price).toBeFocused();
    await expect(toggle).toBeChecked();
    await expect(save).toBeDisabled();
    await price.fill('12.50');
    await expect(price).toHaveValue('12.50');
    await save.click();
    await expect(page.getByLabel('Mock saved pricing')).toHaveText('1250 SEK book_only');
    await price.fill('12,75');
    await save.click();
    await expect(page.getByLabel('Mock saved pricing')).toHaveText('1275 SEK book_only');
    for (const [draft, amount] of [['.50', 50], [',75', 75]]) {
      await price.fill(draft);
      await expect(save).toBeEnabled();
      await save.click();
      await expect(page.getByLabel('Mock saved pricing')).toHaveText(`${amount} SEK book_only`);
    }
    for (const invalid of ['', '-1', 'abc', '12x']) {
      await price.fill(invalid);
      await expect(save).toBeDisabled();
      await expect(price).toHaveAttribute('aria-invalid', 'true');
    }
    await page.getByRole('button', { name: 'Reload sample price', exact: true }).click();
    await expect(price).toHaveValue('27.5');
    await expect(save).toBeEnabled();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(price).toHaveCount(0);
    await save.click();
    await expect(page.getByLabel('Mock saved pricing')).toHaveText('0 SEK book_only');
    await toggle.click();
    await expect(price).toBeVisible();
    await expect(toggle).toBeChecked();
  });
  await check('description label mobile themes and blur', async page => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const description = page.getByRole('textbox', { name: 'Description', exact: true });
    await expect(description).toBeVisible();
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      await page.locator('label').filter({ hasText: /^Description$/ }).click();
      await expect(description).toBeFocused();
      await expect.poll(() => description.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await description.fill(`Synthetic description ${dark}`);
      await description.press('Tab');
      await expect.poll(() => page.evaluate(() => window.__f1.writes.at(-1))).toEqual({ description: `Synthetic description ${dark}` });
      await expect(description).toHaveValue(`Synthetic description ${dark}`);
      await description.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `description-${dark ? 'dark' : 'light'}.png`) });
    }
  });
  await check('existing workflow navigation', async page => {
    const nav = page.getByRole('navigation', { name: 'Book workflow', exact: true });
    expect(await nav.locator('ol a').allTextContents()).toEqual(['01Write', '02Cover', '03Audio', '04Translate', '05Pricing', '06Publish', '07Review']);
    await expect(nav.locator('[aria-current="step"]')).toHaveCount(1);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const link of await nav.getByRole('link').all()) {
        const bounds = await link.boundingBox();
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.width).toBeGreaterThanOrEqual(44);
      }
    }
    const previous = nav.getByRole('link', { name: 'Back to Write', exact: true });
    await previous.focus();
    await page.keyboard.press('Tab');
    await expect(nav.locator('ol a').first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(nav.locator('[aria-current="step"]')).toBeFocused();
    await page.screenshot({ path: path.join(output, 'workflow-mobile.png') });
  });
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (!results.length || results.some(result => result.result === 'FAIL')) process.exitCode = 1;
}
