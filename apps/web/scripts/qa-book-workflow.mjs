/* Local UI regression checks: no sign-in, production records or AI providers. */
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = process.env.QA_OUTPUT || '/tmp/verkli-book-workflow-qa';
  fs.mkdirSync(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem('verkli-cookie-consent', 'declined'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${process.env.QA_BASE_URL || 'http://localhost:3025'}/dev/book-workflow`);
    const consent = page.getByRole('button', { name: 'Essential only' });
    if (await consent.isVisible()) await consent.click();
    const scene = page.getByLabel('Describe the scene');
    await scene.fill('A ferry disappearing into a violet dusk.');
    await page.getByRole('button', { name: 'Write a custom prompt instead' }).click();
    await page.getByLabel('Describe the cover you want').fill('Retain this custom idea.');
    await page.getByRole('button', { name: 'Use a template instead' }).click();
    await expect(scene).toHaveValue('A ferry disappearing into a violet dusk.');
    await page.getByLabel('Starting point').selectOption('silhouette');
    await page.getByLabel('Describe the figure').fill('A sailor at the edge of the pier.');
    await page.getByRole('button', { name: 'Write a custom prompt instead' }).click();
    await expect(page.getByLabel('Describe the cover you want')).toHaveValue('Retain this custom idea.');
    await page.getByRole('button', { name: 'Use a template instead' }).click();
    await expect(page.getByLabel('Starting point')).toHaveValue('silhouette');
    await expect(page.getByLabel('Describe the figure')).toHaveValue('A sailor at the edge of the pier.');
    await page.getByLabel('Starting point').selectOption('landscape');
    await scene.fill('A ferry disappearing into a violet dusk.');
    const labels = await page.locator('nav[aria-label="Book workflow"] ol a').allTextContents();
    expect(labels.map(s => s.trim())).toEqual(['01Write','02Cover','03Audio','04Translate','05Pricing','06Publish','07Review']);
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });

    const toggle = page.getByRole('button', { name: 'AI Assistant', exact: true });
    const dialog = page.getByRole('dialog', { name: 'AI assistant', exact: true });
    await toggle.click();
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(toggle).toBeFocused();
    // An overlay leaves the form width alone on a normal laptop.
    expect((await scene.boundingBox()).width).toBeGreaterThan(400);

    await page.setViewportSize({ width: 1920, height: 1100 });
    await toggle.click();
    await expect.poll(() => dialog.evaluate(el => el.matches(':modal'))).toBe(false);
    expect((await scene.boundingBox()).width).toBeGreaterThan(300);
    await page.getByRole('button', { name: 'Suggest three visual directions for this book cover.' }).click();
    await expect(page.getByLabel('Message to the AI assistant')).toHaveValue('Suggest three visual directions for this book cover.');
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('This is a local UI preview.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await page.screenshot({ path: path.join(output, 'desktop-assistant.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close AI assistant', exact: true }).click();
    await toggle.click();
    await expect(page.getByText('This is a local UI preview.', { exact: false })).toBeVisible();

    // Crossing the docking threshold keeps the exact same conversation.
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect.poll(() => dialog.evaluate(el => el.matches(':modal'))).toBe(true);
    await expect(page.getByText('This is a local UI preview.', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    for (const width of [1920, 1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await scene.boundingBox()).width).toBeGreaterThan(width === 320 ? 240 : 280);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await scene.evaluate(el => getComputedStyle(el).fontSize)).toBe('16px');
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    await toggle.click();
    await page.screenshot({ path: path.join(output, 'mobile-assistant.png') });
    await page.getByLabel('Message to the AI assistant').focus();
    for (let n = 0; n < 8; n++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(output, 'dark.png'), fullPage: true });
    await page.getByRole('button', { name: 'Generate covers', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Generating covers', exact: true })).toBeDisabled();
    await expect(page.getByRole('alert').filter({ hasText: 'UI preview only.' })).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.getByRole('alert').filter({ hasText: 'Choose a JPG or PNG image.' })).toBeVisible();
    await page.locator('input[type=file]').setInputFiles(path.resolve(scriptDirectory, '../public/demo-assets/covers/01.jpg'));
    const cover = page.getByRole('img', { name: 'Book cover', exact: true });
    await expect(cover).toBeVisible();
    expect(await cover.evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Upload cover', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ result: 'PASS', checks: ['template draft retention', 'seven steps and pricing order', 'responsive docking', 'Escape and focus restoration', 'transcript persistence', 'no page jump', 'six widths without overflow', 'mobile focus trap', 'dark/reduced motion', 'loading and error feedback'], screenshots: output }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
