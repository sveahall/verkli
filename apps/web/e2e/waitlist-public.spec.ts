import { test, expect, type Page } from "@playwright/test";

type MockReply = { status: number; json: Record<string, unknown> };

function signupReply(position: number, alreadyExists = false): MockReply {
  return {
    status: 200,
    json: { ok: true, position, id: "mock-waitlist-id", alreadyExists, emailSent: !alreadyExists },
  };
}

async function mockSignup(page: Page, endpoint: string, replies: MockReply[]) {
  const submissions: unknown[] = [];
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    submissions.push(route.request().postDataJSON());
    const reply = replies.shift();
    await route.fulfill(reply ?? {
      status: 503,
      json: { error: "Unexpected additional signup request" },
    });
  });
  return submissions;
}

test.beforeEach(async ({ context, baseURL }) => {
  const previewOrigin = new URL(baseURL!).origin;
  await context.route("**/*", async (route) => {
    const request = route.request();
    // No test may create a signup, order, analytics event, or other live write.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      await route.fulfill({ status: 503, json: { error: "Blocked by public waitlist test" } });
      return;
    }
    if (new URL(request.url()).origin !== previewOrigin) {
      await route.abort();
      return;
    }
    await route.continue();
  });
});

test("retains both role drafts and keeps reader signup separate", async ({ page }) => {
  const submissions = await mockSignup(page, "/api/waitlist/reader", [signupReply(27)]);
  await page.goto("/waitlist");
  const author = page.getByRole("button", { name: "I’m an author", exact: true });
  const reader = page.getByRole("button", { name: "I’m a reader", exact: true });
  await expect(author).toHaveAttribute("aria-pressed", "true");
  await expect(reader).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Join the waitlist", exact: true })).toHaveCount(1);

  await page.getByLabel("Author email", { exact: true }).fill("author-draft@example.test");
  await reader.click();
  await expect(reader).toHaveAttribute("aria-pressed", "true");
  await expect(author).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Author email", { exact: true })).toBeHidden();
  await page.getByLabel("Reader email", { exact: true }).fill("reader-draft@example.test");
  await expect(page.getByRole("button", { name: "Join the waitlist", exact: true })).toHaveCount(1);

  await author.click();
  await expect(page.getByLabel("Reader email", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Author email", { exact: true })).toHaveValue("author-draft@example.test");
  await reader.click();
  await expect(page.getByLabel("Reader email", { exact: true })).toHaveValue("reader-draft@example.test");
  await page.getByRole("button", { name: "Join the waitlist", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("You're on the reader waitlist");
  await expect(page.getByRole("status")).toContainText("#27");
  expect(submissions).toEqual([{ email: "reader-draft@example.test", source: "waitlist_page" }]);

  await author.click();
  await expect(page.getByLabel("Author email", { exact: true })).toHaveValue("author-draft@example.test");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("verkli_waitlist_author_status"))).toBeNull();
  await page.reload();
  await reader.click();
  await expect(page.getByRole("status")).toContainText("You're on the reader waitlist");
  await expect(page.getByRole("status")).toContainText("#27");
  expect(submissions).toHaveLength(1);
});

test("author signup sends the trimmed email and restores success after reload", async ({ page }) => {
  const submissions = await mockSignup(page, "/api/waitlist", [signupReply(42)]);
  await page.goto("/waitlist");
  await page.getByLabel("Author email", { exact: true }).fill("  Author@Example.test  ");
  await page.getByRole("button", { name: "Join the waitlist", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("You're on the waitlist");
  await expect(page.getByRole("status")).toContainText("#42");
  expect(submissions).toEqual([{ email: "Author@Example.test", source: "waitlist_page" }]);
  expect(await page.evaluate(() => ({
    email: localStorage.getItem("verkli_waitlist_author_email"),
    status: localStorage.getItem("verkli_waitlist_author_status"),
    position: localStorage.getItem("verkli_waitlist_author_position"),
    readerStatus: localStorage.getItem("verkli_waitlist_reader_status"),
  }))).toEqual({ email: "author@example.test", status: "success", position: "42", readerStatus: null });

  await page.reload();
  await expect(page.getByRole("status")).toContainText("You're on the waitlist");
  await expect(page.getByRole("status")).toContainText("#42");
  await expect(page.getByRole("button", { name: "Join the waitlist", exact: true })).toHaveCount(0);
  expect(submissions).toHaveLength(1);
});

for (const role of ["author", "reader"] as const) {
  const endpoint = role === "author" ? "/api/waitlist" : "/api/waitlist/reader";
  const roleButton = role === "author" ? "I’m an author" : "I’m a reader";
  const emailLabel = role === "author" ? "Author email" : "Reader email";
  const duplicateMessage = role === "author"
    ? "This email is already on the waitlist."
    : "This email is already on the reader waitlist.";

  test(`${role} duplicate persists and can reset to a fresh form`, async ({ page }) => {
    const submissions = await mockSignup(page, endpoint, [signupReply(7, true)]);
    await page.goto("/waitlist");
    await page.getByRole("button", { name: roleButton, exact: true }).click();
    await page.getByLabel(emailLabel, { exact: true }).fill("existing@example.test");
    await page.getByRole("button", { name: "Join the waitlist", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(duplicateMessage);
    await expect(page.getByRole("status")).toContainText("#7");

    await page.reload();
    await page.getByRole("button", { name: roleButton, exact: true }).click();
    await expect(page.getByRole("status")).toContainText(duplicateMessage);
    await page.getByRole("button", { name: "Use a different email", exact: true }).click();
    await expect(page.getByLabel(emailLabel, { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Join the waitlist", exact: true })).toBeEnabled();
    expect(await page.evaluate((selectedRole) => ["email", "status", "position"].map(
      (key) => localStorage.getItem(`verkli_waitlist_${selectedRole}_${key}`),
    ), role)).toEqual([null, null, null]);
    expect(submissions).toHaveLength(1);
  });

  test(`${role} server failure keeps the email available for retry`, async ({ page }) => {
    const submissions = await mockSignup(page, endpoint, [
      { status: 500, json: { error: "GENERIC_ERROR" } },
      signupReply(8),
    ]);
    await page.goto("/waitlist");
    await page.getByRole("button", { name: roleButton, exact: true }).click();
    const email = page.getByLabel(emailLabel, { exact: true });
    const submit = page.getByRole("button", { name: "Join the waitlist", exact: true });
    const alert = page.getByRole("main").getByRole("alert");
    await email.fill("retry@example.test");
    await submit.click();
    await expect(alert).toHaveText("Something went wrong. Try again.");
    await expect(email).toHaveValue("retry@example.test");
    await expect(email).toBeEnabled();
    await expect(submit).toBeEnabled();
    expect(await page.evaluate((selectedRole) => localStorage.getItem(
      `verkli_waitlist_${selectedRole}_status`,
    ), role)).toBeNull();

    await submit.click();
    await expect(page.getByRole("status")).toContainText("#8");
    await expect(alert).toHaveCount(0);
    expect(submissions).toEqual([
      { email: "retry@example.test", source: "waitlist_page" },
      { email: "retry@example.test", source: "waitlist_page" },
    ]);
  });
}

test.describe("mobile waitlist", () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const width of [320, 390]) {
    test(`${width}px keeps inputs readable and the book reachable without overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/waitlist");
      for (const roleButton of ["I’m an author", "I’m a reader"]) {
        await page.getByRole("button", { name: roleButton, exact: true }).click();
        await expect(page.getByRole("button", { name: "Join the waitlist", exact: true })).toHaveCount(1);
        const fontSizes = await page.locator("input:visible").evaluateAll((inputs) => inputs.map(
          (input) => parseFloat(getComputedStyle(input).fontSize),
        ));
        expect(fontSizes.length).toBeGreaterThan(0);
        for (const fontSize of fontSizes) expect(fontSize).toBeGreaterThanOrEqual(16);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      }

      const bookLink = page.getByRole("button", { name: "Beställ Johans bok nedan", exact: true });
      await expect(bookLink).toBeVisible();
      await bookLink.click();
      await expect(page.locator("#book-order-heading")).toBeInViewport();
      await expect(page.locator("#book-order input[type='email']")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }
});

for (const width of [390, 1440]) {
  test(`${width}px generated product previews switch without layout jumps or AI requests`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/")) writes.push(request.url());
    });
    await page.goto("/waitlist");
    const preview = page.getByRole("group", { name: "Explore the product preview" });
    const scene = page.locator(".wl-preview-art");
    let initialHeight = 0;
    let initialProductHeight = 0;

    for (const [label, alt] of [
      ["Write", "Verkli writing studio with highlighted manuscript text."],
      ["Translate", "Verkli translation studio showing the same sentence in English, Swedish and Spanish."],
      ["Create audio", "Verkli audiobook studio with a narration waveform and chapter preview."],
    ]) {
      const button = preview.getByRole("button", { name: label, exact: true });
      await button.focus();
      await page.keyboard.press("Space");
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(preview.locator("button[aria-pressed='true']")).toHaveCount(1);
      const image = page.getByRole("img", { name: alt, exact: true });
      await expect(image).toBeVisible();
      await expect(image).toHaveJSProperty("complete", true);
      expect(await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
      await expect(page.locator(".wl-preview-art img:visible")).toHaveCount(1);
      const height = (await scene.boundingBox())!.height;
      if (!initialHeight) initialHeight = height;
      expect(height).toBeCloseTo(initialHeight, 0);
      const productHeight = (await page.locator(".wl-product").boundingBox())!.height;
      if (!initialProductHeight) initialProductHeight = productHeight;
      expect(productHeight).toBeCloseTo(initialProductHeight, 0);
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
    await expect(page.getByRole("heading", { name: "Give your words a voice." })).toBeVisible();
    await preview.getByRole("button", { name: "Translate", exact: true }).click();
    await expect(page.getByText("Och det här var bara början.", { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  });
}
