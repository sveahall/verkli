import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Start next dev with public translation/audio flags on and marketing off.
// node scripts/qa-ai-team.mjs http://127.0.0.1:3064 /tmp/ai-team-qa
const origin = process.argv[2] || "http://127.0.0.1:3064";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) throw new Error("This synthetic fixture is localhost-only.");
const output = process.argv[3] || "/tmp/verkli-ai-team-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const members = ["edith", "alma", "august", "stella", "ernst"];
try {
  for (const width of [1440, 390]) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
    await context.addInitScript((value) => localStorage.setItem("verkli-theme", value), theme);
    let calls = 0;
    let fail = false;
    let release;
    await context.route("**/api/books/avatar-preview/ai/chat", async (route) => {
      calls++;
      expect(route.request().postDataJSON().message.length).toBeGreaterThan(0);
      await new Promise((resolve) => { release = resolve; });
      await route.fulfill({ status: fail ? 503 : 200, contentType: "application/json", body: JSON.stringify({ content: "Keep the short opening. It fits the narrator’s voice.", source: "template" }) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/dev/ai-team`, { waitUntil: "networkidle" });
    const consent = page.getByRole("button", { name: "Essential only", exact: true });
    if (await consent.isVisible()) await consent.click();
    const team = page.locator("#creative-team");
    const card = (id) => team.locator(`button[data-agent="${id}"]`);
    await expect(team.locator("button[data-agent]")).toHaveCount(5);
    for (const id of members) {
      await card(id).click();
      await expect(card(id)).toHaveAttribute("aria-pressed", "true");
      await expect(card(id).locator("img")).toHaveJSProperty("complete", true);
      expect(await card(id).locator("img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      if (id === "stella") await expect(team.getByText("Not available in this beta")).toBeVisible();
      else await expect(team.getByRole("link", { name: "Get early access" })).toHaveAttribute("href", "/waitlist#join-waitlist");
    }
    await card("ernst").focus();
    await page.keyboard.press("Home");
    await expect(card("edith")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(card("ernst")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(card("edith")).toBeFocused();
    await page.keyboard.press("End");
    await expect(card("ernst")).toHaveAttribute("aria-pressed", "true");
    await card("edith").click();

    if (width === 1440) {
      const bounds = await card("edith").boundingBox();
      await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .3);
      expect(await card("edith").evaluate((el) => el.style.getPropertyValue("--portrait-x"))).not.toBe("");
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await card("edith").locator("img").evaluate((el) => getComputedStyle(el.parentElement).transform)).toBe("none");
      await page.emulateMedia({ reducedMotion: "no-preference" });
    } else {
      const track = team.getByRole("group", { name: "Choose a team member" });
      await track.scrollIntoViewIfNeeded();
      const bounds = await track.boundingBox();
      const cdp = await context.newCDPSession(page);
      const y = bounds.y + 150;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 310, y }] });
      for (const x of [270, 230, 190, 150, 110, 70]) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
      await expect(card("edith")).toHaveAttribute("aria-pressed", "false");
      await cdp.detach();
    }
    await card("edith").click();
    await team.screenshot({ path: path.join(output, `team-${width}-${theme}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    await page.getByRole("checkbox", { name: "Workspace", exact: true }).check();
    for (const [id, panel] of [["edith", "ai"], ["alma", "translate"], ["august", "audiobook"], ["ernst", "pricing"]]) {
      await card(id).click();
      await expect(team.locator(`a[href="/author/books/avatar-preview?panel=${panel}"]`)).toBeVisible();
    }
    await page.getByRole("checkbox", { name: "No book", exact: true }).check();
    await team.getByRole("button", { name: "Create a book to start" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Create book action received." })).toBeVisible();
    await card("edith").click();
    await team.screenshot({ path: path.join(output, `workspace-${width}-${theme}.png`) });

    const chat = page.getByRole("region", { name: "Edith chat preview" });
    await chat.getByRole("button", { name: "Where does the pacing sag?" }).click();
    const composer = chat.getByRole("textbox", { name: "Message to the AI assistant" });
    await expect(composer).toHaveValue("Where does the pacing sag?");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(chat.getByText("Edith is thinking…")).toBeVisible();
    await composer.fill("My next question");
    await composer.press("Control+Enter");
    await expect(composer).toHaveValue("My next question");
    expect(calls).toBe(1);
    release();
    await expect(chat.getByText("Keep the short opening. It fits the narrator’s voice.")).toBeVisible();
    await expect(chat.getByText("Canned reply — the AI model was unavailable.")).toBeVisible();
    fail = true;
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => calls).toBe(2);
    release();
    await expect(chat.getByRole("alert")).toHaveText("The assistant could not be reached. Try again.");
    await expect(composer).toBeEnabled();
    await chat.screenshot({ path: path.join(output, `edith-${width}-${theme}.png`) });
    expect(errors).toEqual([]);
    results.push({ width, theme, members: 5, keyboard: "PASS", routing: "PASS", emptyBook: "PASS", chat: "mock success/fallback/error/in-flight draft PASS", swipe: width === 390 ? "real touch PASS" : "pointer/reduced motion PASS", errors });
    await context.close();
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ status: "PASS", results }, null, 2));
} finally {
  await browser.close();
}
