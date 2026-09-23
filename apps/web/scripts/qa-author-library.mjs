/* Real library/shell regression checks with synthetic data and no real writes. */
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:3053';
const origin = new URL(baseURL).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Author library QA requires localhost.');
const output = process.env.QA_OUTPUT || '/tmp/verkli-author-library-qa';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const titles = ['Den sista färjan', 'Another day, another slay', 'The Light We Keep'];
const cards = page => page.locator('article[data-book-id]');
const hero = page => page.getByRole('link', { name: `Continue editing ${titles[0]}`, exact: true });
const cardTitles = page => cards(page).getByRole('heading', { level: 3 }).allTextContents();
const writes = page => page.evaluate(() => window.__authorLibraryQA.writes);

async function check(name, run) {
  if (process.env.QA_CASE && !name.includes(process.env.QA_CASE)) return;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  page.setDefaultTimeout(30_000);
  const errors = [];
  const networkWrites = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  // Defense in depth: deny external requests and native/API writes before navigation.
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) {
      networkWrites.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.origin !== origin) {
      externalRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem('verkli-cookie-consent', 'declined');
    localStorage.setItem('verkli-theme', 'light');
    sessionStorage.removeItem('verkli_author_current_book');
  });
  try {
    await page.goto(`${origin}/dev/author-library`);
    await expect(page.getByRole('searchbox', { name: 'Search books' })).toBeVisible({ timeout: 30_000 });
    // Observe the installed fixture fetch, retaining its local-only responses.
    await page.evaluate(() => {
      const previewFetch = window.fetch;
      const state = window.__authorLibraryQA = { writes: [] };
      window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (!['GET', 'HEAD'].includes(method)) state.writes.push(`${method} ${url.pathname}`);
        return previewFetch(input, init);
      };
    });
    await run(page);
    expect(errors).toEqual([]);
    expect(networkWrites).toEqual([]);
    expect(externalRequests).toEqual([]);
    results.push({ name, result: 'PASS' });
    console.log(`${name}: PASS`);
  } catch (error) {
    results.push({ name, result: 'FAIL', error: error.message, pageErrors: errors, networkWrites, externalRequests });
    console.error(`${name}: ${error.message}`);
    await page.screenshot({ path: path.join(output, `${name.replaceAll(/[^a-z0-9]+/gi, '-')}-failure.png`), fullPage: true });
  } finally {
    await page.close();
  }
}

try {
  await check('search filters and stable hero', async page => {
    expect(await cardTitles(page)).toEqual(titles);
    for (const name of ['All (3)', 'Drafts (2)', 'Published (1)', 'Archived (0)']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(hero(page)).toHaveAttribute('href', '/author/books/library-ferry?panel=audiobook');
    await page.getByRole('button', { name: 'Drafts (2)', exact: true }).click();
    expect(await cardTitles(page)).toEqual(titles.slice(0, 2));
    await page.getByRole('button', { name: 'Published (1)', exact: true }).click();
    expect(await cardTitles(page)).toEqual([titles[2]]);
    await expect(hero(page)).toBeVisible();
    await page.getByRole('button', { name: 'Archived (0)', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No books found', exact: true })).toBeVisible();
    await expect(hero(page)).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search books' })).toBeFocused();
    const search = page.getByRole('searchbox', { name: 'Search books' });
    await search.fill('  FINAL CROSSING  ');
    expect(await cardTitles(page)).toEqual([titles[0]]);
    await search.fill('the light');
    expect(await cardTitles(page)).toEqual([titles[2]]);
    await search.fill('there are no matching books');
    await expect(page.getByRole('heading', { name: 'No books found', exact: true })).toBeVisible();
    await expect(hero(page)).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    expect(await cardTitles(page)).toEqual(titles);
  });

  await check('sort view and current book remain independent', async page => {
    const sort = page.getByRole('combobox', { name: 'Sort books' });
    await expect(sort).toHaveValue('recent');
    await sort.selectOption('title');
    expect(await cardTitles(page)).toEqual([titles[1], titles[0], titles[2]]);
    await sort.selectOption('chapters');
    expect(await cardTitles(page)).toEqual([titles[2], titles[0], titles[1]]);
    await expect(hero(page)).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('verkli_author_current_book'))).toBe('library-ferry');
    const list = page.getByRole('button', { name: 'List view', exact: true });
    const grid = page.getByRole('button', { name: 'Grid view', exact: true });
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await list.click();
    await expect(list).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveAttribute('aria-pressed', 'false');
    expect(await cardTitles(page)).toEqual([titles[2], titles[0], titles[1]]);
    await page.screenshot({ path: path.join(output, 'list-desktop.png'), fullPage: true });
    await grid.click();
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await sort.selectOption('recent');
    expect(await cardTitles(page)).toEqual(titles);
  });

  await check('normal demo and reader hrefs', async page => {
    const expected = ['audiobook', 'publish', 'review'];
    for (let index = 0; index < titles.length; index++) {
      const id = ['library-ferry', 'library-another', 'library-light'][index];
      await expect(page.getByRole('link', { name: `Open ${titles[index]}`, exact: true })).toHaveAttribute('href', `/author/books/${id}?panel=${expected[index]}`);
    }
    const reader = cards(page).filter({ has: page.getByRole('heading', { name: titles[2], exact: true }) }).locator('a[href="/reader/books/library-light"]');
    await expect(reader).toHaveAttribute('href', '/reader/books/library-light');
    await expect(reader).toHaveAttribute('target', '_blank');
    await expect(reader).toHaveAttribute('rel', /noopener/);
    await page.getByRole('checkbox', { name: 'Demo routing', exact: true }).check();
    for (let index = 0; index < titles.length; index++) {
      const id = ['library-ferry', 'library-another', 'library-light'][index];
      await expect(page.getByRole('link', { name: `Open ${titles[index]}`, exact: true })).toHaveAttribute('href', `/author/books/${id}?panel=cover`);
    }
    await expect(hero(page)).toHaveAttribute('href', '/author/books/library-ferry?panel=cover');
    await expect(reader).toHaveAttribute('href', '/reader/books/library-light');
    await page.getByRole('checkbox', { name: 'Demo routing', exact: true }).uncheck();
    await expect(hero(page)).toHaveAttribute('href', '/author/books/library-ferry?panel=audiobook');
    expect(page.url()).toBe(`${origin}/dev/author-library`);
    expect(await writes(page)).toEqual([]);
  });

  await check('keyboard actions and delete cancel', async page => {
    const action = page.getByRole('button', { name: `Book actions for ${titles[0]}`, exact: true });
    await action.focus();
    await page.keyboard.press('Enter');
    await expect(action.locator('..')).toHaveJSProperty('open', true);
    await expect(page.getByRole('button', { name: 'Delete book', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(action.locator('..')).toHaveJSProperty('open', false);
    await expect(action).toBeFocused();
    await action.click();
    await page.getByRole('button', { name: 'Delete book', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete book', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(titles[0]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(page.url()).toBe(`${origin}/dev/author-library`);
    expect(await writes(page)).toEqual([]);
    await expect(cards(page)).toHaveCount(3);
  });

  await check('create validation local error import and focus', async page => {
    const newBook = page.getByRole('button', { name: 'New book', exact: true });
    await newBook.click();
    const dialog = page.getByRole('dialog', { name: 'New book', exact: true });
    await expect(dialog).toBeVisible();
    const title = dialog.getByRole('textbox', { name: 'Title', exact: true });
    await expect(title).toBeFocused();
    await dialog.getByRole('button', { name: 'Create book', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Please add a title to continue.');
    await expect(title).toBeFocused();
    expect(await writes(page)).toEqual([]);
    await title.fill('Synthetic QA book');
    await dialog.getByRole('button', { name: 'Create book', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Local preview only.' })).toBeVisible();
    expect(await writes(page)).toEqual(['POST /api/books']);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(newBook).toBeFocused();
    const createCard = page.getByRole('button', { name: 'Create book', exact: true });
    await createCard.click();
    await expect(title).toHaveValue('');
    await dialog.getByRole('button', { name: 'import from file', exact: true }).click();
    const importDialog = page.getByRole('dialog', { name: 'Import book', exact: true });
    await expect(importDialog).toBeVisible();
    await expect(importDialog.getByText('No imports yet.', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(importDialog).not.toBeVisible();
    // The unchanged shell's development form is intercepted too.
    await page.getByRole('button', { name: '🎭 Toggle demo mode (dev)', exact: true }).click();
    expect(page.url()).toBe(`${origin}/dev/author-library`);
    expect(await writes(page)).toEqual(['POST /api/books']);
    await expect(cards(page)).toHaveCount(3);
  });

  await check('empty and stress data', async page => {
    const data = page.getByRole('combobox', { name: 'Preview data', exact: true });
    await data.selectOption('empty');
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Create your first book', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Write your first book', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Continue editing / })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No books found', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New book', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'empty-desktop.png'), fullPage: true });
    await data.selectOption('stress');
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByText('Unknown status', { exact: true })).toBeVisible();
    await expect(page.getByText('Last edit unavailable', { exact: true }).first()).toBeVisible();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.screenshot({ path: path.join(output, 'stress-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Archived (1)', exact: true }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toHaveAttribute('data-book-id', 'library-archive');
  });

  await check('failed cover keeps book navigation available', async page => {
    await page.route(url => url.pathname === '/_next/image' && url.searchParams.get('url') === '/demo-assets/covers/01.jpg', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Synthetic image failure' }));
    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'Search books' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cover unavailable', { exact: true })).toHaveCount(2);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole('link', { name: `Open ${titles[0]}`, exact: true })).toHaveAttribute('href', '/author/books/library-ferry?panel=audiobook');
    await expect(hero(page)).toHaveAttribute('href', '/author/books/library-ferry?panel=audiobook');
    await page.screenshot({ path: path.join(output, 'cover-unavailable.png'), fullPage: true });
  });

  await check('responsive themes targets and reduced motion', async page => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const controls = [
        page.getByRole('searchbox', { name: 'Search books' }),
        page.getByRole('combobox', { name: 'Sort books' }),
        page.getByRole('button', { name: 'New book', exact: true }),
        page.getByRole('button', { name: 'All (3)', exact: true }),
        page.getByRole('button', { name: 'Grid view', exact: true }),
        page.getByRole('button', { name: 'List view', exact: true }),
        page.getByRole('button', { name: `Book actions for ${titles[0]}`, exact: true }),
      ];
      for (const control of controls) {
        const box = await control.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      if (![1440, 390].includes(width)) continue;
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
        await page.screenshot({ path: path.join(output, `library-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
      }
    }
    expect(await cards(page).evaluateAll(elements => elements.every(element => {
      const style = getComputedStyle(element);
      return (style.animationName === 'none' || style.animationDuration.split(',').every(duration => parseFloat(duration) <= 0.01)) &&
        style.transitionDuration.split(',').every(duration => parseFloat(duration) <= 0.01);
    }))).toBe(true);
    await page.getByRole('button', { name: 'List view', exact: true }).evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(output, 'list-mobile-dark.png'), fullPage: true });
  });
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (!results.length || results.some(result => result.result === 'FAIL')) process.exitCode = 1;
}
