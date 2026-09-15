/* Real editor regression checks; synthetic documents, no authenticated API traffic. */
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = new URL(process.env.QA_BASE_URL || 'http://127.0.0.1:3062');
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Editor QA requires localhost.');
const output = process.env.QA_OUTPUT || '/tmp/verkli-author-editor-qa';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const cases = [];
const state = async page => JSON.parse(await page.getByTestId('editor-preview-state').textContent());
const editor = page => page.locator('.ProseMirror');
const chapter = (page, number) => page.getByRole('button', { name: new RegExp(`^Chapter ${number}:`) });
const toolbar = page => page.getByRole('button', { name: 'Writing tools', exact: true }).locator('..');
async function selectText(page, value) {
  await editor(page).evaluate((element, text) => {
    element.focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(text);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + text.length);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error(`Missing visible text: ${text}`);
  }, value);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(value);
}
async function append(page, text) {
  await editor(page).evaluate(element => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.insertText(text);
}
async function open(page, query = '') {
  await page.goto(`${base.origin}/dev/author-editor${query}`);
  await expect(page.getByRole('region', { name: 'Book editor' })).toBeVisible({ timeout: 30_000 });
  if (!query.includes('empty')) {
    await expect(editor(page)).toBeVisible({ timeout: 30_000 });
    if (page.viewportSize().width >= 1024) {
      await expect(page.getByRole('combobox', { name: 'Writing preset', exact: true })).toBeVisible({ timeout: 30_000 });
    }
  }
}
async function check(name, run) { cases.push([name, run]); }
async function runCheck(name, run) {
  if (process.env.QA_CASE && !name.includes(process.env.QA_CASE)) return;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  page.setDefaultTimeout(30_000);
  const errors = [], unexpectedNetwork = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) {
      unexpectedNetwork.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem('verkli-cookie-consent', 'declined');
    localStorage.setItem('verkli-theme', 'light');
  });
  try {
    await open(page);
    await run(page);
    expect(errors).toEqual([]);
    expect(unexpectedNetwork).toEqual([]);
    results.push({ name, result: 'PASS' });
    console.log(`${name}: PASS`);
  } catch (error) {
    results.push({ name, result: 'FAIL', error: error.message, errors, unexpectedNetwork });
    console.error(`${name}: ${error.message}`);
    fs.writeFileSync(path.join(output, `${name.replaceAll(/[^a-z0-9]+/gi, '-')}-state.json`), JSON.stringify(await state(page).catch(() => null), null, 2));
    await page.screenshot({ path: path.join(output, `${name.replaceAll(/[^a-z0-9]+/gi, '-')}-failure.png`), fullPage: true });
  } finally { await page.close(); }
}
try {
  await check('format selection keyboard undo and redo', async page => {
    const original = await editor(page).innerText();
    await selectText(page, 'Färjan');
    await toolbar(page).getByRole('button', { name: 'Bold', exact: true }).click();
    await expect(editor(page).locator('strong').filter({ hasText: 'Färjan' })).toHaveText('Färjan');
    await toolbar(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor(page).locator('strong').filter({ hasText: 'Färjan' })).toHaveCount(0);
    await toolbar(page).getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(editor(page).locator('strong').filter({ hasText: 'Färjan' })).toHaveCount(1);
    await selectText(page, 'Färjan');
    await toolbar(page).getByRole('button', { name: 'Italic', exact: true }).press('Enter');
    await expect(editor(page).locator('em').filter({ hasText: 'Färjan' })).toHaveText('Färjan');
    expect(await editor(page).innerText()).toBe(original);
    await page.getByRole('button', { name: 'Writing tools', exact: true }).click();
    await page.getByRole('button', { name: 'Writing tools', exact: true }).click();
    await toolbar(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor(page).locator('em').filter({ hasText: 'Färjan' })).toHaveCount(0);
    expect(await editor(page).innerText()).toBe(original);
  });
  await check('autosave debounce continuous typing chapter and focus flush', async page => {
    await append(page, ' Debounce marker.');
    await expect.poll(async () => (await state(page)).chapters[0].content).toContain('Debounce marker.');
    await editor(page).evaluate(element => {
      window.__editorQaInputTimes = [];
      element.addEventListener('input', () => window.__editorQaInputTimes.push(Date.now()));
    });
    const typed = ' continuously writing in the book ';
    await page.keyboard.type(typed, { delay: 120 });
    const inputTimes = await page.evaluate(() => window.__editorQaInputTimes);
    expect(inputTimes.length).toBeGreaterThan(1);
    const firstInput = inputTimes[0], lastInput = inputTimes.at(-1);
    const continuousSaves = (await state(page)).saves.filter(save => save.at >= firstInput && save.at < lastInput);
    // Measure real input events, not command dispatch latency. The scheduler unit
    // suite verifies the exact 500 ms debounce and 2 s ceiling with fake timers.
    console.log('Save/input timing:', JSON.stringify({ inputOffsets: inputTimes.map(at => at - firstInput), saveOffsets: continuousSaves.map(save => save.at - firstInput) }));
    expect(continuousSaves.length).toBeGreaterThan(0);
    await expect.poll(async () => (await state(page)).chapters[0].content).toContain(typed.trim());
    await append(page, ' Chapter flush marker.');
    await chapter(page, 2).click();
    await expect(editor(page)).toContainText('Ljus på andra sidan');
    const switched = await state(page);
    expect(switched.chapters[0].content).toContain('Chapter flush marker.');
    expect(switched.chapters[1].content).not.toContain('Chapter flush marker.');
    await chapter(page, 1).click();
    await expect(editor(page)).toContainText('Chapter flush marker.');
    await append(page, ' Focus flush marker.');
    await page.getByRole('button', { name: 'Focus mode', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Exit focus mode', exact: true }).first()).toBeVisible();
    await expect.poll(async () => (await state(page)).chapters[0].content).toContain('Focus flush marker.');
    await page.getByRole('button', { name: 'Exit focus mode', exact: true }).first().click();
    await expect(editor(page)).toContainText('Focus flush marker.');
  });
  await check('find exact replacements across paragraphs and formatted text', async page => {
    const original = await editor(page).innerText();
    await selectText(page, 'Färjan');
    await toolbar(page).getByRole('button', { name: 'Bold', exact: true }).click();
    await page.getByRole('tab', { name: 'Find', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('Färjan');
    await expect(page.getByRole('tabpanel', { name: 'Find', exact: true })).toContainText('1 of 2');
    await page.getByRole('button', { name: 'Next match', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'Find', exact: true })).toContainText('2 of 2');
    await page.getByRole('button', { name: 'Previous match', exact: true }).click();
    await page.getByRole('textbox', { name: 'Replace', exact: true }).fill('Båten');
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    expect(await editor(page).innerText()).toBe(original.replace('Färjan', 'Båten'));
    await page.getByRole('button', { name: 'Replace all', exact: true }).click();
    expect(await editor(page).innerText()).toBe(original.replaceAll('Färjan', 'Båten'));
    await toolbar(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor(page)).toContainText('Färjan');
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('fÄRJAN');
    await page.getByRole('checkbox', { name: 'Match case', exact: true }).check();
    await expect(page.getByRole('tabpanel', { name: 'Find', exact: true })).toContainText('No matches');
    await page.getByRole('checkbox', { name: 'Match case', exact: true }).uncheck();
    await expect(page.getByRole('tabpanel', { name: 'Find', exact: true })).not.toContainText('No matches');
  });
  await check('rename chapters pagination deletion and empty states', async page => {
    await page.getByRole('button', { name: 'Rename book', exact: true }).click();
    await page.getByRole('textbox', { name: 'Book title', exact: true }).fill('A different title');
    await page.getByRole('textbox', { name: 'Book title', exact: true }).press('Escape');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Den sista färjan');
    await page.getByRole('button', { name: 'Chapter actions', exact: true }).click();
    await page.getByRole('button', { name: 'Rename chapter', exact: true }).click();
    await page.getByRole('textbox', { name: 'Chapter title', exact: true }).fill('Hemkomsten');
    await page.getByRole('textbox', { name: 'Chapter title', exact: true }).press('Enter');
    await expect(chapter(page, 1)).toContainText('Hemkomsten');
    await page.getByRole('button', { name: 'Chapter actions', exact: true }).click();
    await page.getByRole('button', { name: 'Delete chapter', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await state(page)).chapters).toHaveLength(3);
    await page.getByRole('button', { name: 'Add chapter', exact: true }).click();
    await expect(editor(page)).toHaveText('');
    expect((await state(page)).chapters).toHaveLength(4);
    await page.getByRole('button', { name: 'Chapter actions', exact: true }).click();
    await page.getByRole('button', { name: 'Delete chapter', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    expect((await state(page)).chapters).toHaveLength(3);
    await open(page, '?scenario=many');
    await page.getByRole('button', { name: 'Next chapters', exact: true }).click();
    await chapter(page, 24).click();
    await expect(chapter(page, 24)).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Add chapter', exact: true }).click();
    await expect(chapter(page, 25)).toBeInViewport();
    await open(page, '?scenario=empty');
    await expect(page.getByRole('heading', { name: 'Your first chapter starts here.' })).toBeVisible();
    await page.getByRole('button', { name: 'Add your first chapter', exact: true }).click();
    await expect(editor(page)).toHaveText('');
    await page.getByRole('button', { name: 'Chapter actions', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Delete chapter', exact: true })).toHaveCount(0);
  });
  await check('panel tabs outline font and mobile focus', async page => {
    const format = page.getByRole('tab', { name: 'Format', exact: true });
    await format.focus();
    await format.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Outline', exact: true })).toBeFocused();
    await page.getByRole('tab', { name: 'Outline', exact: true }).press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Outline', exact: true })).toContainText('Hamnen i skymning');
    await page.getByRole('tabpanel', { name: 'Outline', exact: true }).getByRole('button', { name: 'Brevet i fickan' }).click();
    await format.click();
    await selectText(page, 'Färjan');
    await page.getByRole('combobox', { name: 'Font family', exact: true }).selectOption('Georgia');
    await expect(editor(page).locator('span[style*="Georgia"]').filter({ hasText: 'Färjan' })).toBeVisible();
    const typography = await editor(page).evaluate(element => ({ size: getComputedStyle(element).fontSize, line: getComputedStyle(element).lineHeight }));
    expect(typography).toEqual({ size: '18px', line: '28.8px' });
    const beforePreset = await editor(page).innerText();
    await page.getByRole('combobox', { name: 'Writing preset', exact: true }).selectOption('essay');
    await expect.poll(() => editor(page).evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    expect(await editor(page).innerText()).toBe(beforePreset);
    await open(page);
    await expect(page.getByRole('combobox', { name: 'Writing preset', exact: true })).toHaveValue('essay');
    await expect.poll(() => editor(page).evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    expect(await editor(page).innerText()).toBe(beforePreset);
    await page.getByRole('combobox', { name: 'Writing preset', exact: true }).selectOption('novel');
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const tools = page.getByRole('button', { name: 'Writing tools', exact: true });
    await expect(tools).toHaveAttribute('aria-expanded', 'false');
    await tools.click();
    await expect(format).toBeVisible();
    await page.getByRole('button', { name: 'Collapse writing tools', exact: true }).click();
    await expect(tools).toBeFocused();
    await expect(tools).toHaveAttribute('aria-expanded', 'false');
  });
  await check('responsive light dark long titles and isolated preview', async page => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await open(page);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => { document.documentElement.classList.toggle('dark', value === 'dark'); document.documentElement.dataset.theme = value; }, theme);
        const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
        expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
        await page.screenshot({ path: path.join(output, `editor-${width}-${theme}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '?scenario=longtitle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: path.join(output, 'editor-long-title-mobile.png'), fullPage: true });
    await page.getByRole('link', { name: 'Cover', exact: true }).click();
    expect(new URL(page.url()).pathname).toBe('/dev/author-editor');
    await expect(page.locator('[aria-label="Local editor preview"]')).toContainText('Navigation stays');
    const blocked = await page.evaluate(async () => {
      const response = await fetch('/api/books', { method: 'POST', body: '{}' });
      return { status: response.status, payload: await response.json() };
    });
    expect(blocked.status).toBe(403);
    expect(blocked.payload.error).toBe('PREVIEW_ONLY');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  });
  // Keyboard/selection checks run sequentially to keep browser focus deterministic.
  for (const [name, run] of cases) await runCheck(name, run);
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
if (results.some(result => result.result === 'FAIL')) process.exitCode = 1;
