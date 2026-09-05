import { expect, test, type Page } from "@playwright/test";
import { startAutosaveHarness } from "./server";
import type { Harness } from "./fixture";

let harness: Awaited<ReturnType<typeof startAutosaveHarness>>;
test.beforeAll(async () => { harness = await startAutosaveHarness(); });
test.afterAll(async () => { await harness?.close(); });

test.beforeEach(async ({ context, page }) => {
  const errors: string[] = [];
  const outbound: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === harness.origin) return route.continue();
    outbound.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    window.fetch = () => { throw new Error("Unexpected fetch"); };
    window.WebSocket = class { constructor() { throw new Error("Unexpected WebSocket"); } } as unknown as typeof WebSocket;
  });
  // Real editor/scheduler code with controlled browser time: switching before
  // debounce is deterministic and does not depend on the machine's speed.
  await page.clock.install({ time: new Date("2026-09-05T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-05T12:00:01Z"));
  test.info().annotations.push({ type: "isolation", description: "Synthetic transport; no auth or real database" });
  // Kept per page so every scenario checks the complete run, including drain.
  failures.set(page, { errors, outbound });
});
const failures = new Map<Page, { errors: string[]; outbound: string[] }>();
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual({ errors: [], outbound: [] });
  failures.delete(page);
});

const editor = (page: Page) => page.locator('.tiptap[contenteditable="true"]');
async function open(page: Page, mode = "held", query = "") {
  await page.goto(`${harness.origin}/?mode=${mode}${query}`);
  await page.clock.runFor(1_000);
  await expect(editor(page)).toHaveText("A0");
}
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const { writes, deletes, creates, renames, renameProjections, deleteProjections, dbTitles, successes, db, dbOrder, orderWrites, orderProjections, orderReads, refreshCalls, refreshSnapshots, toasts, chapters, selected, unchangedB, state } = window.autosaveHarness;
    return { writes, deletes, creates, renames, renameProjections, deleteProjections, dbTitles, successes, db, dbOrder, orderWrites, orderProjections, orderReads, refreshCalls, refreshSnapshots, toasts, chapters, selected, unchangedB, state };
  });
}
async function switchTo(page: Page, number: number, expectedId = number === 1 ? "a" : "b") {
  await page.getByRole("button", { name: `Chapter ${number}`, exact: true }).click();
  await page.clock.runFor(50);
  await expect.poll(async () => (await snapshot(page)).selected).toBe(expectedId);
}
async function append(page: Page, text: string) {
  await editor(page).focus();
  await editor(page).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await editor(page).pressSequentially(text);
}
async function settle(page: Page) { await page.clock.runFor(550); }
async function release(page: Page) { await page.evaluate(() => window.autosaveHarness.release()); }
function expectUnchangedB(observed: Pick<Harness, "db" | "chapters" | "unchangedB">) {
  expect(observed.db.b).toContain("B0");
  expect(observed.unchangedB).toBe(true);
  expect(observed.chapters.map((chapter) => ({ ...chapter, content: null }))).toEqual([
    { id: "a", title: "A", order: 1, book_version_id: "version", content: null },
    { id: "b", title: "B", order: 2, book_version_id: "version", content: null },
  ]);
}

for (const mode of ["held", "error", "missing"]) {
  test(`retains both edits through A→B→A after ${mode} save`, async ({ page }) => {
    await open(page, mode);
    await editor(page).fill("A0 KEEP_A_1");
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
    const pending = await snapshot(page);
    expect(pending.state).toEqual({ isSaving: mode === "held", hasUnsavedChanges: true, saveError: mode !== "held", lastSaved: false });
    if (mode === "missing") expect(pending.toasts[0]).toContain("may have been deleted");
    if (mode === "error") expect(pending.toasts[0]).toContain("Your changes are still here");
    await switchTo(page, 2);
    await expect(editor(page)).toHaveText("B0");
    await switchTo(page, 1);
    await expect(editor(page)).toHaveText("A0 KEEP_A_1");
    await append(page, " KEEP_A_2");
    await settle(page);
    await release(page);
    await expect.poll(async () => (await snapshot(page)).state).toEqual({ isSaving: false, hasUnsavedChanges: false, saveError: false, lastSaved: true });
    await expect(editor(page)).toHaveText("A0 KEEP_A_1 KEEP_A_2");
    const observed = await snapshot(page);
    expect(observed.writes.map((write) => write.id)).toEqual(["a", "a"]);
    expect(observed.db.a).toContain("A0 KEEP_A_1 KEEP_A_2");
    expectUnchangedB(observed);
  });
}

test("switching before debounce flushes and retains the departing draft", async ({ page }) => {
  await open(page);
  await editor(page).fill("A0 BEFORE_DEBOUNCE");
  expect((await snapshot(page)).writes).toEqual([]);
  await switchTo(page, 2);
  await expect(editor(page)).toHaveText("B0");
  await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
  expect((await snapshot(page)).writes[0]).toMatchObject({ id: "a", content: expect.stringContaining("BEFORE_DEBOUNCE") });
  await switchTo(page, 1);
  await expect(editor(page)).toHaveText("A0 BEFORE_DEBOUNCE");
  await release(page);
  await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
  expect((await snapshot(page)).db.a).toContain("BEFORE_DEBOUNCE");
  expectUnchangedB(await snapshot(page));
});

test("an older acknowledgement cannot replace a newer draft when its write fails", async ({ page }) => {
  await open(page, "older-ack");
  await editor(page).fill("A0 KEEP_A_1");
  await settle(page);
  await append(page, " KEEP_A_2");
  await settle(page);
  await release(page);
  await expect.poll(async () => (await snapshot(page)).state.saveError).toBe(true);
  const failed = await snapshot(page);
  expect(failed.writes).toHaveLength(2);
  expect(failed.db.a).toContain("A0 KEEP_A_1");
  expect(failed.db.a).not.toContain("KEEP_A_2");
  expect(failed.chapters[0].content).toContain("A0 KEEP_A_1 KEEP_A_2");
  expect(failed.state).toEqual({ isSaving: false, hasUnsavedChanges: true, saveError: true, lastSaved: true });
  await switchTo(page, 2);
  await switchTo(page, 1);
  await expect(editor(page)).toHaveText("A0 KEEP_A_1 KEEP_A_2");
  await append(page, " RETRY");
  await settle(page);
  await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
  expect((await snapshot(page)).db.a).toContain("A0 KEEP_A_1 KEEP_A_2 RETRY");
  expectUnchangedB(await snapshot(page));
});

test("B edits queue separately while A is held and both remount with their latest text", async ({ page }) => {
  await open(page);
  await editor(page).fill("A0 KEEP_A");
  await settle(page);
  await switchTo(page, 2);
  await editor(page).fill("B0 KEEP_B_1");
  await settle(page);
  await append(page, " KEEP_B_2");
  await settle(page);
  expect((await snapshot(page)).writes.map((write) => write.id)).toEqual(["a"]);
  await switchTo(page, 1);
  await expect(editor(page)).toHaveText("A0 KEEP_A");
  await switchTo(page, 2);
  await expect(editor(page)).toHaveText("B0 KEEP_B_1 KEEP_B_2");
  await release(page);
  await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
  const observed = await snapshot(page);
  expect(observed.writes.map((write) => write.id)).toEqual(["a", "b"]);
  expect(observed.db.a).toContain("A0 KEEP_A");
  expect(observed.db.b).toContain("B0 KEEP_B_1 KEEP_B_2");
});

for (const held of [false, true]) {
  test(`deleted chapter is never resurrected or queued (${held ? "held write" : "unmount flush"})`, async ({ page }) => {
    await open(page);
    await editor(page).fill("A0 DELETE_ME");
    if (held) {
      await settle(page);
      await append(page, " PENDING_AT_DELETE");
    }
    await page.getByRole("button", { name: "Delete chapter 1", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(editor(page)).toHaveText("B0");
    const deleted = await snapshot(page);
    expect(deleted.chapters.map((chapter) => chapter.id)).toEqual(["b"]);
    expect(deleted.deletes).toEqual([
      { table: "ai_jobs", column: "input->>chapterId", id: "a" },
      { table: "chapter_audio_cache", column: "chapter_id", id: "a" },
      { table: "chapters", column: "id", id: "a" },
    ]);
    expect(deleted.writes).toHaveLength(held ? 1 : 0);
    await release(page);
    await expect.poll(async () => (await snapshot(page)).state.isSaving).toBe(false);
    await editor(page).fill("B0 SURVIVES");
    await settle(page);
    if (!held) await release(page); // B owns the first held response in this case.
    await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
    const observed = await snapshot(page);
    expect(observed.chapters.map((chapter) => chapter.id)).toEqual(["b"]);
    expect(observed.db.a).toBeUndefined();
    expect(observed.db.b).toContain("B0 SURVIVES");
    expect(observed.writes.map((write) => write.id)).toEqual(held ? ["a", "b"] : ["b"]);
    expect(observed.toasts).toEqual([]);
    expect(observed.state.saveError).toBe(false);
  });
}

test("optimistic chapter rerender preserves the editor node, text, and middle caret", async ({ page }) => {
  await open(page);
  await editor(page).fill("A0 TAIL");
  await editor(page).evaluate((element) => {
    window.getSelection()?.setPosition(element.querySelector("p")!.firstChild, 2);
  });
  await editor(page).pressSequentially(" FIRST");
  const node = await editor(page).elementHandle();
  const caret = () => page.evaluate(() => ({
    text: window.getSelection()?.anchorNode?.textContent,
    offset: window.getSelection()?.anchorOffset,
    focused: document.activeElement?.classList.contains("tiptap"),
  }));
  const before = await caret();
  expect(before).toEqual({ text: "A0 FIRST TAIL", offset: 8, focused: true });
  await settle(page);
  expect((await snapshot(page)).chapters[0].content).toContain("A0 FIRST TAIL");
  expect(await node!.evaluate((element) => element === document.querySelector(".tiptap"))).toBe(true);
  expect(await caret()).toEqual(before);
  await editor(page).pressSequentially(" SECOND");
  await expect(editor(page)).toHaveText("A0 FIRST SECOND TAIL");
  await settle(page);
  await release(page);
  await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
  expect((await snapshot(page)).db.a).toContain("A0 FIRST SECOND TAIL");
});

test("delayed chapter deletion preserves a sibling draft accepted during cleanup", async ({ page }) => {
  await open(page, "delayed-delete");
  const initialC = (await snapshot(page)).chapters[2];
  await page.getByRole("button", { name: "Delete chapter 1", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.autosaveHarness.heldDeletes.length)).toBe(1);
  // The real dialog closes before deletion finishes, so another chapter remains
  // editable while the cleanup request and then that chapter's save are held.
  await switchTo(page, 2);
  await expect(editor(page)).toHaveText("B0");
  await editor(page).fill("B0 KEEP_B");
  await settle(page);
  await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
  await expect.poll(async () => (await snapshot(page)).chapters[1].content).toContain("B0 KEEP_B");
  const pending = await snapshot(page);
  expect(pending.chapters[1].content).toContain("B0 KEEP_B");
  expect(pending.writes.map((write) => write.id)).toEqual(["b"]);
  await page.evaluate(() => window.autosaveHarness.releaseDelete());
  await expect.poll(async () => (await snapshot(page)).chapters.map((chapter) => chapter.id)).toEqual(["b", "c"]);
  expect((await snapshot(page)).state).toEqual({ isSaving: true, hasUnsavedChanges: true, saveError: false, lastSaved: false });
  await release(page);
  await expect.poll(async () => (await snapshot(page)).state).toEqual({ isSaving: false, hasUnsavedChanges: false, saveError: false, lastSaved: true });
  await switchTo(page, 2, "c");
  await expect(editor(page)).toHaveText("C0");
  await switchTo(page, 1, "b");
  await expect(editor(page)).toHaveText("B0 KEEP_B");
  await append(page, " NEXT_EDIT");
  await settle(page);
  await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
  const observed = await snapshot(page);
  expect(observed.db.a).toBeUndefined();
  expect(observed.db.b).toContain("B0 KEEP_B NEXT_EDIT");
  expect(observed.chapters.map((chapter) => ({ ...chapter, content: null }))).toEqual([
    { id: "b", title: "B", order: 2, book_version_id: "version", content: null },
    { id: "c", title: "C", order: 3, book_version_id: "version", content: null },
  ]);
  expect(observed.chapters[1]).toEqual(initialC);
  expect(observed.db.c).toBe(initialC.content);
  expect(observed.writes.map((write) => write.id)).toEqual(["b", "b"]);
  expect(observed.state).toEqual({ isSaving: false, hasUnsavedChanges: false, saveError: false, lastSaved: true });
});

for (const operation of ["create", "rename"]) {
  test(`delayed chapter ${operation} preserves a sibling draft accepted during the request`, async ({ page }) => {
    await open(page, `delayed-${operation}`);
    if (operation === "create") {
      await page.getByRole("button", { name: "Add chapter", exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).creates.length).toBe(1);
    } else {
      await page.getByTitle("Click to rename chapter", { exact: true }).click();
      await page.locator("input").fill("Renamed A");
    }
    // Selecting B blurs the real A title input and starts its rename request.
    await switchTo(page, 2);
    await expect(editor(page)).toHaveText("B0");
    await expect.poll(() => page.evaluate(() => window.autosaveHarness.heldMutations.length)).toBe(1);
    await editor(page).fill("B0 KEEP_B");
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
    await expect.poll(async () => (await snapshot(page)).chapters[1].content).toContain("B0 KEEP_B");
    await page.evaluate(() => window.autosaveHarness.releaseMutation());
    if (operation === "create") {
      await expect.poll(async () => (await snapshot(page)).selected).toBe("c");
      await expect.poll(async () => (await snapshot(page)).chapters.length).toBe(3);
    } else {
      await expect.poll(async () => (await snapshot(page)).chapters[0].title).toBe("Renamed A");
    }
    // Neither successful metadata operation may claim the held content is saved.
    expect((await snapshot(page)).state.hasUnsavedChanges).toBe(true);
    expect((await snapshot(page)).state.lastSaved).toBe(false);
    await release(page);
    await expect.poll(async () => (await snapshot(page)).state).toEqual({ isSaving: false, hasUnsavedChanges: false, saveError: false, lastSaved: true });
    if (operation === "rename") {
      await switchTo(page, 1);
      await expect(editor(page)).toHaveText("A0");
    }
    await switchTo(page, 2);
    await expect(editor(page)).toHaveText("B0 KEEP_B");
    await append(page, " NEXT_EDIT");
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
    const observed = await snapshot(page);
    expect(observed.db.b).toContain("B0 KEEP_B NEXT_EDIT");
    expect(observed.db.a).toContain("A0");
    expect(observed.writes.map((write) => write.id)).toEqual(["b", "b"]);
    expect(observed.chapters.map((chapter) => ({ ...chapter, content: null }))).toEqual([
      { id: "a", title: operation === "rename" ? "Renamed A" : "A", order: 1, book_version_id: "version", content: null },
      { id: "b", title: "B", order: 2, book_version_id: "version", content: null },
      ...(operation === "create" ? [{ id: "c", title: "Chapter 3", order: 3, book_version_id: "version", content: null }] : []),
    ]);
    if (operation === "create") {
      expect(observed.creates).toEqual([{ book_id: "book", book_version_id: "version", title: "Chapter 3", content: "", order: 3 }]);
      expect(observed.db.c).toBe("");
    } else {
      expect(observed.renames).toEqual([{ id: "a", title: "Renamed A" }]);
    }
  });
}

for (const operation of ["create", "rename", "delete"]) {
  for (const newerFailure of [false, true]) {
    test(`${operation} does not reload stale parent props over ${newerFailure ? "a newer failed" : "a held"} sibling draft`, async ({ page }) => {
      await open(page, `delayed-${operation}`, `&refresh=1${newerFailure ? "&failure=1" : ""}`);
      if (operation === "create") {
        await page.getByRole("button", { name: "Add chapter", exact: true }).click();
      } else if (operation === "rename") {
        await page.getByTitle("Click to rename chapter", { exact: true }).click();
        await page.locator("input").fill("Renamed A");
      } else {
        await page.getByRole("button", { name: "Delete chapter 1", exact: true }).click();
        await page.getByRole("button", { name: "Delete", exact: true }).click();
      }
      await switchTo(page, 2);
      await expect(editor(page)).toHaveText("B0");
      await expect.poll(() => page.evaluate(() => window.autosaveHarness.heldMutations.length + window.autosaveHarness.heldDeletes.length)).toBe(1);
      await editor(page).fill("B0 KEEP_B_1");
      await settle(page);
      await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
      if (newerFailure) {
        await append(page, " KEEP_B_2");
        await settle(page);
      }
      await page.evaluate((op) => {
        if (op === "delete") window.autosaveHarness.releaseDelete();
        else window.autosaveHarness.releaseMutation();
      }, operation);
      if (operation === "create") await expect.poll(async () => (await snapshot(page)).selected).toBe("c");
      else if (operation === "rename") await expect.poll(async () => (await snapshot(page)).chapters[0].title).toBe("Renamed A");
      else await expect.poll(async () => (await snapshot(page)).chapters.map((chapter) => chapter.id)).toEqual(["b", "c"]);
      await page.clock.runFor(50);
      // Remount before acknowledging the held save. A completion-only repair
      // would be too late to protect a fresh edit in this returning editor.
      if (operation === "rename") await switchTo(page, 1);
      if (operation === "delete") await switchTo(page, 2, "c");
      await switchTo(page, operation === "delete" ? 1 : 2, "b");
      const retained = `B0 KEEP_B_1${newerFailure ? " KEEP_B_2" : ""}`;
      await expect(editor(page)).toHaveText(retained);
      expect((await snapshot(page)).state.hasUnsavedChanges).toBe(true);
      await release(page);
      await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(newerFailure);
      if (newerFailure) {
        await expect.poll(async () => (await snapshot(page)).state.saveError).toBe(true);
        if (operation === "delete") await switchTo(page, 2, "c");
        else await switchTo(page, 1);
        await switchTo(page, operation === "delete" ? 1 : 2, "b");
        await expect(editor(page)).toHaveText(retained);
      }
      await append(page, " NEXT_EDIT");
      await settle(page);
      await expect.poll(async () => (await snapshot(page)).state).toEqual({ isSaving: false, hasUnsavedChanges: false, saveError: false, lastSaved: true });
      const observed = await snapshot(page);
      expect(observed.db.b).toContain(`${retained} NEXT_EDIT`);
      expect(observed.refreshCalls).toBe(0);
      expect(observed.refreshSnapshots).toEqual([]);
      if (operation === "delete") expect(observed.db.a).toBeUndefined();
      if (operation === "create") expect(observed.chapters.find((chapter) => chapter.id === "c")).toMatchObject({ title: "Chapter 3", order: 3, book_version_id: "version" });
      if (operation === "rename") expect(observed.chapters[0].title).toBe("Renamed A");
    });
  }
}

const railChapter = (page: Page, title: string) => page.getByTestId("order-rail").locator("[draggable]").filter({
  has: page.getByRole("button", { name: `Move ${title} up`, exact: true }),
});
async function changeOrder(page: Page, operation: string) {
  if (operation === "move") {
    await page.getByRole("button", { name: "Move A down", exact: true }).click();
  } else {
    await railChapter(page, "A").dispatchEvent("dragstart");
    await railChapter(page, "B").dispatchEvent("dragover");
    await railChapter(page, "B").dispatchEvent("drop");
  }
}

for (const operation of ["move", "reorder"]) {
  test(`${operation} keeps sibling text while saving the new order without refreshing content`, async ({ page }) => {
    await open(page, `delayed-order-${operation}`, "&refresh=1");
    await changeOrder(page, operation);
    await expect.poll(() => page.evaluate(() => window.autosaveHarness.heldOrders.length)).toBe(1);
    await railChapter(page, "B").getByRole("button").first().click();
    await expect(editor(page)).toHaveText("B0");
    await editor(page).fill("B0 KEEP_B");
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
    await page.evaluate(() => window.autosaveHarness.releaseOrder());
    await expect.poll(async () => (await snapshot(page)).orderWrites.length).toBe(operation === "move" ? 3 : 4);
    await railChapter(page, "A").getByRole("button").first().click();
    await expect(editor(page)).toHaveText("A0");
    await railChapter(page, "B").getByRole("button").first().click();
    await expect(editor(page)).toHaveText("B0 KEEP_B");
    await release(page);
    await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
    const observed = await snapshot(page);
    expect(observed.refreshCalls).toBe(0);
    expect(observed.dbOrder).toEqual({ a: 2, b: 1 });
    expect(observed.chapters.map((chapter) => chapter.id)).toEqual(["b", "a"]);
    expect(observed.db.b).toContain("B0 KEEP_B");
  });

  test(`failed ${operation} reloads only authoritative order and preserves the held draft`, async ({ page }) => {
    await open(page, "order-error", "&refresh=1");
    await switchTo(page, 2);
    await expect(editor(page)).toHaveText("B0");
    await editor(page).fill("B0 KEEP_B");
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
    await changeOrder(page, operation);
    await expect.poll(async () => (await snapshot(page)).toasts.length).toBe(1);
    const failed = await snapshot(page);
    expect(failed.toasts[0]).toContain("Could not change chapter order");
    expect(failed.orderWrites).toHaveLength(1);
    expect(failed.orderReads).toHaveLength(1);
    expect([...failed.orderReads[0]].sort()).toEqual(["a", "b"]);
    expect(failed.chapters.map(({ id, order }) => ({ id, order }))).toEqual([{ id: "a", order: 1 }, { id: "b", order: 2 }]);
    expect(failed.chapters[1].content).toContain("B0 KEEP_B");
    expect(failed.state.hasUnsavedChanges).toBe(true);
    expect(failed.refreshCalls).toBe(0);
    await switchTo(page, 1);
    await switchTo(page, 2);
    await expect(editor(page)).toHaveText("B0 KEEP_B");
    await release(page);
    await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
    expect((await snapshot(page)).db.b).toContain("B0 KEEP_B");
  });
}

for (const readbackFailure of [false, true]) {
  test(`order recovery ${readbackFailure ? "reports a failed readback" : "uses the partially persisted sentinel order"} without replacing text`, async ({ page }) => {
    await open(page, "order-error", `&refresh=1&order-fail-at=2${readbackFailure ? "&order-read-error=1" : ""}`);
    await switchTo(page, 2);
    await expect(editor(page)).toHaveText("B0");
    await editor(page).fill("B0 KEEP_B");
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
    await changeOrder(page, "move");
    await expect.poll(async () => (await snapshot(page)).toasts.length).toBe(1);
    const failed = await snapshot(page);
    expect(failed.orderWrites).toEqual([{ id: "a", order: -2 }, { id: "b", order: 1 }]);
    expect(failed.dbOrder).toEqual({ a: -2, b: 2 });
    expect(failed.orderReads).toEqual([["a", "b"]]);
    if (readbackFailure) {
      expect(failed.toasts[0]).toContain("or reload its saved order");
      expect(failed.toasts[0]).not.toContain("has been restored");
    } else {
      // This is authoritative reconciliation, not an atomic rollback: the
      // successful first sentinel remains persisted after the second write fails.
      expect(failed.chapters.map(({ id, order }) => ({ id, order }))).toEqual([{ id: "a", order: -2 }, { id: "b", order: 2 }]);
    }
    expect(failed.chapters.find((chapter) => chapter.id === "b")?.content).toContain("B0 KEEP_B");
    expect(failed.refreshCalls).toBe(0);
    expect(failed.state.hasUnsavedChanges).toBe(true);
    await railChapter(page, "A").getByRole("button").first().click();
    await expect(editor(page)).toHaveText("A0");
    await railChapter(page, "B").getByRole("button").first().click();
    await expect(editor(page)).toHaveText("B0 KEEP_B");
    await release(page);
    await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
    expect((await snapshot(page)).db.b).toContain("B0 KEEP_B");
  });
}

test("zero affected order rows report failure and reconcile order without losing prose", async ({ page }) => {
  await open(page, "order-zero", "&refresh=1&order-zero-at=3");
  await switchTo(page, 2);
  await expect(editor(page)).toHaveText("B0");
  await editor(page).fill("B0 KEEP_B");
  await settle(page);
  await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1);
  await changeOrder(page, "move");
  await expect.poll(async () => (await snapshot(page)).toasts.length).toBe(1);
  const failed = await snapshot(page);
  expect(failed.orderProjections).toEqual(["id", "id", "id"]);
  expect(failed.orderWrites).toEqual([{ id: "a", order: -2 }, { id: "b", order: 1 }, { id: "a", order: 2 }]);
  expect(failed.orderReads).toEqual([["a", "b"]]);
  expect(failed.chapters.map(({ id, order }) => ({ id, order }))).toEqual([{ id: "a", order: -2 }, { id: "b", order: 1 }]);
  expect(failed.toasts[0]).toContain("Could not change chapter order");
  expect(failed.chapters[1].content).toContain("B0 KEEP_B");
  expect(failed.refreshCalls).toBe(0);
  await switchTo(page, 1);
  await switchTo(page, 2);
  await expect(editor(page)).toHaveText("B0 KEEP_B");
  await release(page);
  await expect.poll(async () => (await snapshot(page)).state.hasUnsavedChanges).toBe(false);
  expect((await snapshot(page)).db.b).toContain("B0 KEEP_B");
});


test("zero-row rename reports failure and retains the saved title", async ({ page }) => {
  await open(page, "rename-zero", "&refresh=1");
  await page.getByTitle("Click to rename chapter", { exact: true }).click();
  await page.locator("input").fill("Refused title");
  await switchTo(page, 2);
  await expect.poll(async () => (await snapshot(page)).renames.length).toBe(1);
  expect((await snapshot(page)).chapters[0].title).toBe("A");
  await expect.poll(async () => (await snapshot(page)).toasts).toEqual(["Could not rename chapter. Try again."]);
  await switchTo(page, 1);
  await expect(page.getByTitle("Click to rename chapter", { exact: true })).toHaveText(/^A /);
  await expect(editor(page)).toHaveText("A0");
  const observed = await snapshot(page);
  expect(observed.renameProjections).toEqual(["id"]);
  expect(observed.dbTitles.a).toBe("A");
  expect(observed.successes).toEqual([]);
  expect(observed.refreshCalls).toBe(0);
  expect(observed.state).toEqual({ isSaving: false, hasUnsavedChanges: false, saveError: false, lastSaved: false });
  expectUnchangedB(observed);
});

for (const queued of [false, true]) {
  test(`zero-row deletion preserves ${queued ? "held and queued drafts through retry" : "the pre-debounce draft"}`, async ({ page }) => {
    await open(page, "delete-zero", queued ? "&refresh=1&failure=1" : "&refresh=1");
    await editor(page).fill("A0 KEEP_A_1");
    if (queued) {
      await settle(page);
      await append(page, " KEEP_A_2");
      await settle(page);
      expect((await snapshot(page)).writes).toHaveLength(1);
      expect((await snapshot(page)).chapters[0].content).toContain("KEEP_A_2");
    } else {
      expect((await snapshot(page)).writes).toEqual([]);
    }
    await page.getByRole("button", { name: "Delete chapter 1", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).deletes.length).toBe(3);
    await expect(editor(page)).toHaveText(queued ? "A0 KEEP_A_1 KEEP_A_2" : "A0 KEEP_A_1");
    const refused = await snapshot(page);
    expect(refused.chapters.map((chapter) => chapter.id)).toEqual(["a", "b"]);
    expect(refused.selected).toBe("a");
    expect(refused.deleteProjections).toEqual(["id"]);
    expect(refused.toasts).toEqual(["Could not delete chapter. Try again."]);
    expect(refused.successes).toEqual([]);
    expect(refused.refreshCalls).toBe(0);
    expect(refused.db.a).toContain("A0");
    expect(refused.state).toEqual({ isSaving: queued, hasUnsavedChanges: true, saveError: false, lastSaved: false });
    if (!queued) await settle(page);
    await switchTo(page, 2);
    await switchTo(page, 1);
    await expect(editor(page)).toHaveText(queued ? "A0 KEEP_A_1 KEEP_A_2" : "A0 KEEP_A_1");
    await release(page);
    await expect.poll(async () => (await snapshot(page)).state).toEqual({ isSaving: false, hasUnsavedChanges: queued, saveError: queued, lastSaved: true });
    if (queued) {
      expect((await snapshot(page)).writes.map((write) => write.id)).toEqual(["a", "a"]);
      expect((await snapshot(page)).db.a).not.toContain("KEEP_A_2");
      await switchTo(page, 2);
      await switchTo(page, 1);
      await expect(editor(page)).toHaveText("A0 KEEP_A_1 KEEP_A_2");
    }
    await append(page, " RETRY");
    await settle(page);
    await expect.poll(async () => (await snapshot(page)).state).toEqual({ isSaving: false, hasUnsavedChanges: false, saveError: false, lastSaved: true });
    const observed = await snapshot(page);
    expect(observed.db.a).toContain(queued ? "A0 KEEP_A_1 KEEP_A_2 RETRY" : "A0 KEEP_A_1 RETRY");
    expect(observed.writes.map((write) => write.id)).toEqual(queued ? ["a", "a", "a"] : ["a", "a"]);
    expect(observed.successes).toEqual([]);
    expectUnchangedB(observed);
  });
}
