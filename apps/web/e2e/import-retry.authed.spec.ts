import { test, expect, type Page } from "@playwright/test";

// Run only with a temporary local page rendering the real ImportBookModal.
// The controlled fixture config must omit auth.setup and real storage state.
const fixturePath = process.env.IMPORT_RETRY_FIXTURE_PATH;
test.skip(!fixturePath, "Requires the controlled local ImportBookModal fixture");
const id = "00000000-0000-4000-8000-000000000001";
const bookId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";
const failed = { id, file_name: "Synthetic old manuscript.txt", status: "failed", progress: 0, error: "Synthetic parser failure", book_id: null as string | null, book_version_id: null as string | null, created_at: "2020-01-01T00:00:00.000Z" };
async function isolate(page: Page) {
  await page.context().route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, json: {} });
    return route.continue();
  });
}
test.beforeEach(async ({ page }) => isolate(page));

test("failed old import retries once and completion invokes the current callback", async ({ page }) => {
  let item = { ...failed };
  let posts = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [item] } }));
  await page.route(`**/api/books/imports/${id}`, async (route) => {
    posts++;
    await gate;
    item = { ...failed, status: "pending", error: "" };
    await route.fulfill({ json: { ok: true, id, jobId: id } });
  });
  await page.goto(fixturePath!);
  await expect(page.getByText(failed.file_name)).toBeVisible();
  const retry = page.getByRole("button", { name: "Try again", exact: true });
  await expect(retry).toBeVisible();
  await retry.evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect.poll(() => posts).toBe(1);
  await expect(page.getByRole("button", { name: "Retrying...", exact: true })).toBeDisabled();
  release();
  await expect(page.getByText("Queued", { exact: true }).first()).toBeVisible();
  item = { ...failed, status: "completed", progress: 100, error: "", book_id: bookId, book_version_id: versionId };
  await expect(page.getByTestId("import-completion")).toHaveText(`${bookId}:${versionId}`, { timeout: 10_000 });
  await expect(page.getByTestId("completion-count")).toHaveText("1");
  expect(posts).toBe(1);
});

for (const error of ["QUEUE_UNAVAILABLE", "IMPORT_SOURCE_INVALID", "IMPORT_MISSING_FILE_INFO"]) {
  test(`retry displays ${error} without a fake queued row`, async ({ page }) => {
    await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [failed] } }));
    await page.route(`**/api/books/imports/${id}`, (route) => route.fulfill({ status: error === "QUEUE_UNAVAILABLE" ? 503 : 400, json: { error } }));
    await page.goto(fixturePath!);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText(error === "QUEUE_UNAVAILABLE" ? "The job queue is unavailable. Try again later." : error === "IMPORT_SOURCE_INVALID" ? "This import's saved file cannot be verified. Upload the original file again." : "This import's saved file is missing. Upload the original file again.", { exact: true })).toBeVisible();
    await expect(page.getByText("Queued", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
  });
}

test("upload queue failure preserves the empty state", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [] } }));
  await page.route("**/api/books/import", (route) => { posts++; return route.fulfill({ status: 503, json: { error: "QUEUE_UNAVAILABLE" } }); });
  await page.goto(fixturePath!);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("radio", { name: "no", exact: true }).check();
  await page.locator("#import-file-input").setInputFiles({ name: "synthetic.txt", mimeType: "text/plain", buffer: Buffer.from("Harmless browser fixture only.") });
  await expect(page.getByText("The job queue is unavailable. Try again later.", { exact: true })).toBeVisible();
  await expect(page.getByText("No imports yet.", { exact: true })).toBeVisible();
  await expect(page.getByText("Queued", { exact: true })).toHaveCount(0);
  expect(posts).toBe(1);
});

for (const status of [200, 401, 503]) {
  test(`ignores a delayed ${status} retry response after close and reopen`, async ({ page }) => {
    // Exercise the request guard even when the transport cannot cancel a response.
    await page.addInitScript(() => {
      const fetch = window.fetch.bind(window);
      window.fetch = (input, init) => fetch(input, init?.method === "POST" ? { ...init, signal: undefined } : init);
    });
    let item = { ...failed };
    let posts = 0;
    let release: () => void = () => {};
    let fulfilled = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [item] } }));
    await page.route(`**/api/books/imports/${id}`, async (route) => {
      posts++;
      await gate;
      if (status === 200) item = { ...failed, status: "completed", progress: 100, book_id: bookId, book_version_id: versionId };
      await route.fulfill({ status, json: status === 200 ? { ok: true, id, jobId: id } : { error: status === 401 ? "UNAUTHORIZED" : "QUEUE_UNAVAILABLE" } });
      fulfilled = true;
    });
    await page.goto(fixturePath!);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect.poll(() => posts).toBe(1);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Open import fixture", exact: true }).click();
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
    release();
    await expect.poll(() => fulfilled).toBe(true);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByTestId("completion-count")).toHaveText("0");
    await expect(page.getByText("Import queued again.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("The job queue is unavailable. Try again later.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("You must be logged in.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
  });
}

test("an old retry's finally cannot clear a new session's pending request", async ({ page }) => {
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => fetch(input, init?.method === "POST" ? { ...init, signal: undefined } : init);
  });
  let posts = 0;
  const releases: Array<() => void> = [];
  let firstFulfilled = false;
  await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [failed] } }));
  await page.route(`**/api/books/imports/${id}`, async (route) => {
    const requestIndex = posts++;
    await new Promise<void>((resolve) => { releases[requestIndex] = resolve; });
    await route.fulfill({ status: 503, json: { error: "QUEUE_UNAVAILABLE" } });
    if (requestIndex === 0) firstFulfilled = true;
  });
  await page.goto(fixturePath!);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.poll(() => posts).toBe(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Open import fixture", exact: true }).click();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.poll(() => posts).toBe(2);
  releases[0]();
  await expect.poll(() => firstFulfilled).toBe(true);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("button", { name: "Retrying...", exact: true })).toBeDisabled();
  await expect(page.getByText("The job queue is unavailable. Try again later.", { exact: true })).toHaveCount(0);
  releases[1]();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
  await expect(page.getByText("The job queue is unavailable. Try again later.", { exact: true })).toBeVisible();
  expect(posts).toBe(2);
});

for (const width of [320, 375]) {
  test(`retry has a 44px target with a long filename at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [{ ...failed, file_name: "Synthetic extremely long original manuscript filename ".repeat(10) + ".txt" }] } }));
    await page.goto(fixturePath!);
    const retry = page.getByRole("button", { name: "Try again", exact: true });
    await expect(retry).toBeVisible();
    const bounds = await retry.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Essential only", exact: true }).click();
    await retry.scrollIntoViewIfNeeded();
    await expect(retry).toBeInViewport({ ratio: 1 });
    await retry.click({ trial: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

for (const status of [200, 409, 503]) {
  for (const outcome of ["success", "network-error"]) {
    test(`ignores an old ${status} retry refresh GET ${outcome} after close and reopen`, async ({ page }) => {
      await page.addInitScript(() => {
        const fetch = window.fetch.bind(window);
        window.fetch = (input, init) => fetch(input, { ...init, signal: undefined });
      });
      let listRequests = 0;
      let refreshSettled = false;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => { release = resolve; });
      await page.route("**/api/books/imports?*", async (route) => {
        const index = ++listRequests;
        if (index === 2) {
          await gate;
          if (outcome === "network-error") await route.abort("failed");
          else await route.fulfill({ json: { imports: [{ ...failed, file_name: "Stale previous-session refresh.txt", status: "completed", book_id: bookId, book_version_id: versionId }] } });
          refreshSettled = true;
          return;
        }
        await route.fulfill({ json: { imports: [{ ...failed, file_name: index === 1 ? failed.file_name : "Current session manuscript.txt" }] } });
      });
      await page.route(`**/api/books/imports/${id}`, (route) => route.fulfill({ status, json: status === 200 ? { ok: true, id, jobId: id } : { error: status === 409 ? "IMPORT_NOT_FAILED" : "QUEUE_UNAVAILABLE" } }));
      await page.goto(fixturePath!);
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect.poll(() => listRequests).toBe(2);
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Open import fixture", exact: true }).click();
      await expect(page.getByText("Current session manuscript.txt", { exact: true })).toBeVisible();
      release();
      await expect.poll(() => refreshSettled).toBe(true);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.getByText("Current session manuscript.txt", { exact: true })).toBeVisible();
      await expect(page.getByText("Stale previous-session refresh.txt", { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("completion-count")).toHaveText("0");
      await expect(page.getByText("The job queue is unavailable. Try again later.", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Only failed import jobs can be retried.", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
    });
  }
}

for (const status of [409, 503]) {
  for (const authoritativeStatus of ["extracting", "completed"]) {
    test(`${status} retry refreshes authoritative ${authoritativeStatus} without claiming a successful dispatch`, async ({ page }) => {
      let item = { ...failed };
      let listRequests = 0;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => { release = resolve; });
      await page.route("**/api/books/imports?*", async (route) => {
        if (++listRequests === 2) await gate;
        await route.fulfill({ json: { imports: [item] } });
      });
      await page.route(`**/api/books/imports/${id}`, (route) => {
        item = { ...failed, status: authoritativeStatus, progress: authoritativeStatus === "completed" ? 100 : 30, error: "", book_id: bookId, book_version_id: versionId };
        return route.fulfill({ status, json: { error: status === 409 ? "IMPORT_NOT_FAILED" : "QUEUE_UNAVAILABLE" } });
      });
      await page.goto(fixturePath!);
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      const message = page.getByText(status === 409 ? "Only failed import jobs can be retried." : "The job queue is unavailable. Try again later.", { exact: true });
      await expect(message).toBeVisible();
      await expect.poll(() => listRequests).toBe(2);
      await expect(page.getByText("Failed", { exact: true })).toBeVisible();
      await expect(page.getByText("Queued", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Succeeded", { exact: true })).toHaveCount(0);
      release();
      if (authoritativeStatus === "extracting") {
        await expect(page.getByText("Running 30%", { exact: true })).toBeVisible();
        item = { ...item, status: "completed", progress: 100 };
      }
      await expect(page.getByText("Succeeded", { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("link", { name: "Open book", exact: true })).toHaveAttribute("href", `/author/books/${bookId}`);
      await expect(message).toBeVisible();
      await expect(page.getByText("Import queued again.", { exact: true })).toHaveCount(0);
      // This old row was never confirmed as launched by this modal session.
      await expect(page.getByTestId("completion-count")).toHaveText("0");
      await expect(page.getByTestId("import-completion")).toHaveText("");
    });
  }
}

for (const outcome of ["unchanged", "http-error", "network-error"]) {
  test(`unsuccessful retry retains the failed row and mapped error after a ${outcome} refresh`, async ({ page }) => {
    let listRequests = 0;
    await page.route("**/api/books/imports?*", (route) => {
      if (++listRequests > 1) {
        if (outcome === "http-error") return route.fulfill({ status: 500, json: { error: "DATABASE_ERROR" } });
        if (outcome === "network-error") return route.abort("failed");
      }
      return route.fulfill({ json: { imports: [failed] } });
    });
    await page.route(`**/api/books/imports/${id}`, (route) => route.fulfill({ status: 503, json: { error: "QUEUE_UNAVAILABLE" } }));
    await page.goto(fixturePath!);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect.poll(() => listRequests).toBe(2);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
    await expect(page.getByText(failed.file_name, { exact: true })).toBeVisible();
    await expect(page.getByText("Failed", { exact: true })).toBeVisible();
    await expect(page.getByText("The job queue is unavailable. Try again later.", { exact: true })).toBeVisible();
    await expect(page.getByText("Queued", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Import queued again.", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("completion-count")).toHaveText("0");
  });
}

test("a retry transport error refreshes authoritative processing without claiming success", async ({ page }) => {
  let item = { ...failed };
  await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [item] } }));
  await page.route(`**/api/books/imports/${id}`, (route) => {
    item = { ...failed, status: "extracting", progress: 30 };
    return route.abort("failed");
  });
  await page.goto(fixturePath!);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("The import could not be retried. Try again.", { exact: true })).toBeVisible();
  await expect(page.getByText("Running 30%", { exact: true })).toBeVisible();
  await expect(page.getByText("Import queued again.", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("completion-count")).toHaveText("0");
});

for (const theme of ["light", "dark"]) {
  for (const state of ["normal", "hover"]) {
    test(`retry text meets 4.5:1 contrast in ${theme} ${state}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("verkli-theme", value), theme);
      await page.route("**/api/books/imports?*", (route) => route.fulfill({ json: { imports: [failed] } }));
      await page.goto(fixturePath!);
      const retry = page.getByRole("button", { name: "Try again", exact: true });
      await expect(retry).toBeVisible();
      if (state === "hover") await retry.hover();
      const contrast = await retry.evaluate((element) => {
        // Use the browser's CSS color parser, including alpha/modern color syntax.
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        const rgba = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        };
        const layers: number[][] = [];
        for (let node: Element | null = element; node; node = node.parentElement) {
          layers.push(rgba(getComputedStyle(node).backgroundColor));
        }
        // The fixture has solid ancestor surfaces; compose their actual alpha.
        let background = [255, 255, 255];
        for (const layer of layers.reverse()) {
          const alpha = layer[3] / 255;
          background = background.map((channel, index) => layer[index] * alpha + channel * (1 - alpha));
        }
        const foreground = rgba(getComputedStyle(element).color).slice(0, 3);
        const luminance = (rgb: number[]) => rgb.map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
        const levels = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
        return { foreground, background, ratio: (levels[1] + 0.05) / (levels[0] + 0.05) };
      });
      console.log("[import retry contrast]", JSON.stringify({ theme, state, ...contrast }));
      expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
}
