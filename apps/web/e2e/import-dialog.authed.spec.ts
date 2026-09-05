import { test, expect, type Page } from "@playwright/test";

// Requires the controlled local page rendering the real ImportBookModal and
// shared Dialog, with an actual opener and optional conditional unmount.
// Use an isolated config without auth.setup, env loading, or storage state.
const fixturePath = process.env.IMPORT_RETRY_FIXTURE_PATH;
test.skip(!fixturePath, "Requires the controlled local import dialog fixture");
const failed = {
  id: "00000000-0000-4000-8000-000000000001",
  file_name: "Synthetic manuscript.txt", status: "failed", progress: 0,
  error: "Synthetic parser failure", book_id: null, created_at: "2020-01-01T00:00:00.000Z",
};

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
    return route.continue();
  });
});

async function openImport(page: Page, query = "initial=false") {
  await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [failed] } }));
  await page.goto(`${fixturePath}?${query}`);
  const opener = page.getByRole("button", { name: "Open import fixture", exact: true });
  if (query.includes("initial=false")) await opener.click();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  return opener;
}

test("import is a named native modal with visible initial focus", async ({ page }) => {
  await openImport(page);
  const dialog = page.getByRole("dialog", { name: "Import book", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription("Upload an existing book file to import chapters automatically.");
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  const close = page.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await expect(close).toBeInViewport({ ratio: 1 });
  const bounds = await close.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
});

for (const unmount of [false, true]) {
  test(`Escape and close restore the actual opener with conditional unmount=${unmount}`, async ({ page }) => {
    const opener = await openImport(page, `initial=false${unmount ? "&unmount" : ""}`);
    for (const [index, key] of ["Escape", "close", "Escape"].entries()) {
      await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
      if (key === "close") await page.getByRole("button", { name: "Close", exact: true }).click();
      else await page.keyboard.press(key);
      await expect(page.getByRole("heading", { name: "Import book", exact: true })).toHaveCount(0);
      await expect(opener).toBeFocused();
      if (index < 2) await opener.click();
    }
    await expect(page.getByTestId("close-count")).toHaveText("3");
  });
}

test("Tab stays in the modal and background theme and cookie controls are inert", async ({ page }) => {
  await openImport(page);
  const close = page.getByRole("button", { name: "Close", exact: true });
  await close.focus();
  for (const key of [...Array<string>(12).fill("Tab"), ...Array<string>(12).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog:modal"))).toBe(true);
  }
  for (const name of ["Background theme", "Essential only"]) {
    const control = page.getByRole("button", { name, exact: true, includeHidden: true });
    await control.evaluate((element) => (element as HTMLElement).focus());
    await expect(control).not.toBeFocused();
  }
  await page.locator("#global-theme-toggle").evaluate((element) => (element as HTMLElement).focus());
  await expect(page.locator("#global-theme-toggle")).not.toBeFocused();
  await expect(page.getByTestId("theme-count")).toHaveText("0");
});

test("dragging inside the scroll edge keeps the dialog open and backdrop click closes it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 520 });
  const opener = await openImport(page);
  const dialog = page.getByRole("dialog", { name: "Import book", exact: true });
  const bounds = (await dialog.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + 80);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height - 30, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("close-count")).toHaveText("0");
  await page.mouse.click(4, 4);
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

for (const inline of [false, true]) {
  test(`shared primitive initially open handles controlled Escape with ${inline ? "inline" : "stable"} callback`, async ({ page }) => {
    await page.goto(`${fixturePath}?primitive&ignore${inline ? "&inline" : ""}`);
    const dialog = page.locator("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("close-count")).toHaveText("1");
    // A controlled owner may reject cancellation. Browser default dismissal
    // must not silently close the element while open remains true.
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    // A second Escape on an owner that keeps refusing closure may be
    // noncancelable in Chromium. Accepted closes/reopens are covered below.
  });
}

for (const inline of [false, true]) {
  test(`shared primitive closes and reopens with ${inline ? "inline" : "stable"} callback`, async ({ page }) => {
    await page.goto(`${fixturePath}?primitive${inline ? "&inline" : ""}`);
    const opener = page.getByRole("button", { name: "Open import fixture", exact: true });
    await expect(page.locator("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog")).not.toBeVisible();
    for (let index = 0; index < 3; index++) {
      await opener.click();
      await expect(page.getByRole("button", { name: "Close primitive", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Rerender", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
    }
    await expect(page.getByTestId("close-count")).toHaveText("4");
  });
}

test("keyboard file picker waits for all rights and preserves fields after upload failure", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/books/import", (route) => { uploads++; return route.fulfill({ status: 503, json: { error: "QUEUE_UNAVAILABLE" } }); });
  await openImport(page);
  const picker = page.getByRole("button", { name: "Choose file", exact: true });
  await expect(picker).toBeDisabled();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("radio", { name: "yes", exact: true }).check();
  await expect(picker).toBeDisabled();
  const details = page.getByRole("textbox");
  await details.fill("Synthetic publisher, 2020; rights reverted.");
  await expect(picker).toBeEnabled();
  await expect(page.locator("#import-file-input")).toHaveAttribute("accept", ".epub,.docx,.html,.htm,.txt");
  await picker.focus();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "synthetic.txt", mimeType: "text/plain", buffer: Buffer.from("Harmless fixture") });
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("The job queue is unavailable. Try again later.");
  await expect(details).toHaveValue("Synthetic publisher, 2020; rights reverted.");
  for (const checkbox of await page.getByRole("checkbox").all()) await expect(checkbox).toBeChecked();
  expect(uploads).toBe(1);
});

test("retry errors and success are announced without making the polling list live", async ({ page }) => {
  let posts = 0;
  await page.route(`**/api/books/imports/${failed.id}`, (route) => ++posts === 1
    ? route.fulfill({ status: 400, json: { error: "IMPORT_SOURCE_INVALID" } })
    : route.fulfill({ json: { ok: true, id: failed.id } }));
  await openImport(page);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "cannot be verified" })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Import queued again.");
  expect(await page.locator("ul").evaluate((element) => !!element.closest('[aria-live], [role="status"], [role="alert"]'))).toBe(false);
});

for (const status of [200, 503]) {
  test(`late ${status} upload cannot change a reopened modal session`, async ({ page }) => {
    await page.addInitScript(() => {
      const fetch = window.fetch.bind(window);
      window.fetch = (input, init) => fetch(input, init?.method === "POST" ? { ...init, signal: undefined } : init);
    });
    let release: () => void = () => {};
    let started = false;
    let settled = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/books/import", async (route) => {
      started = true;
      await gate;
      await route.fulfill({ status, json: status === 200 ? { id: "old-upload", status: "pending" } : { error: "QUEUE_UNAVAILABLE" } });
      settled = true;
    });
    const opener = await openImport(page);
    for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
    await page.getByRole("radio", { name: "no", exact: true }).check();
    await page.locator("#import-file-input").setInputFiles({ name: "old-session.txt", mimeType: "text/plain", buffer: Buffer.from("Harmless fixture") });
    await expect.poll(() => started).toBe(true);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await opener.click();
    release();
    await expect.poll(() => settled).toBe(true);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText("Import started. Your file will be processed shortly.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("The job queue is unavailable. Try again later.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("old-session.txt", { exact: true })).toHaveCount(0);
    for (const checkbox of await page.getByRole("checkbox").all()) await expect(checkbox).toBeChecked();
    await expect(page.getByText("Uploading...", { exact: true })).toHaveCount(0);
  });
}

for (const request of ["list", "upload", "retry"]) {
  test(`conditional unmount aborts the pending ${request} request`, async ({ page }) => {
    await page.addInitScript(() => {
      const fetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        init?.signal?.addEventListener("abort", () => document.body.dataset.abortedRequest = String(input));
        return fetch(input, init);
      };
    });
    await openImport(page, "initial=false&unmount");
    let started = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const routeUrl = request === "list" ? "**/api/books/imports?*" : request === "upload" ? "**/api/books/import" : `**/api/books/imports/${failed.id}`;
    await page.route(routeUrl, async (route) => { started = true; await gate; await route.fulfill({ json: {} }).catch(() => {}); });
    if (request === "list") {
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Open import fixture", exact: true }).click();
    } else if (request === "upload") {
      for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
      await page.getByRole("radio", { name: "no", exact: true }).check();
      await page.locator("#import-file-input").setInputFiles({ name: "pending.txt", mimeType: "text/plain", buffer: Buffer.from("Harmless fixture") });
    } else await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await page.evaluate(() => { delete document.body.dataset.abortedRequest; });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect.poll(() => page.locator("body").getAttribute("data-aborted-request")).toBe(request === "list" ? "/api/books/imports?limit=20" : request === "upload" ? "/api/books/import" : `/api/books/imports/${failed.id}`);
    release();
  });
}

for (const theme of ["light", "dark"]) {
  for (const width of [320, 375, 768, 1440]) {
    test(`all controls remain reachable at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 520 : 900 });
      await page.addInitScript((value) => localStorage.setItem("verkli-theme", value), theme);
      await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [{ ...failed, file_name: "Synthetic-long-manuscript-filename-".repeat(12) + ".txt" }] } }));
      await page.goto(`${fixturePath}?initial=true`);
      const dialog = page.getByRole("dialog", { name: "Import book", exact: true });
      await expect(dialog).toBeVisible();
      const close = page.getByRole("button", { name: "Close", exact: true });
      await expect(close).toBeInViewport({ ratio: 1 });
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      for (const checkbox of await page.getByRole("checkbox").all()) {
        await checkbox.check();
        await expect(checkbox).toBeInViewport({ ratio: 1 });
        if (width < 768) expect(await checkbox.evaluate((element) => getComputedStyle(element.closest("label")!).fontSize)).toBe("16px");
      }
      await page.getByRole("radio", { name: "yes", exact: true }).check();
      const details = page.getByRole("textbox");
      await details.fill("Synthetic publication details");
      if (width < 768) expect(await details.evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
      for (const name of ["Choose file", "Try again"]) {
        const button = page.getByRole("button", { name, exact: true });
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport({ ratio: 1 });
        await button.click({ trial: true });
        const size = await button.boundingBox();
        expect(size!.height).toBeGreaterThanOrEqual(44);
        expect(size!.width).toBeGreaterThanOrEqual(44);
      }
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await close.focus();
      await expect(close).toBeInViewport({ ratio: 1 });
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement!;
        const style = getComputedStyle(element);
        return { visible: element.matches(":focus-visible"), outline: style.outlineStyle, shadow: style.boxShadow };
      });
      expect(focus.visible).toBe(true);
      expect(focus.outline !== "none" || focus.shadow !== "none").toBe(true);
    });
  }
}
