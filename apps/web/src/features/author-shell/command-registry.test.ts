/**
 * Pure-helper tests for the command palette registry. Pins the URL
 * contract for resolveCommandHref (the command palette navigates by
 * href, so a typo here silently breaks every shortcut) and the
 * shape contract for buildBookPickerCommands.
 */

import { describe, expect, it } from "vitest";
import {
  AUTHOR_ROOT_COMMANDS,
  buildBookPickerCommands,
  resolveCommandHref,
} from "./command-registry";
import type { AuthorShellBook } from "./workspace-state";

const BOOK_ID = "576969ff-fd9d-45dd-bd46-04fcd535978f";

describe("resolveCommandHref — no bookId", () => {
  it("routes each action to a sensible global fallback", () => {
    expect(resolveCommandHref("create-book")).toBe(
      "/author/library?action=create-book"
    );
    expect(resolveCommandHref("open-book")).toBe("/author/library");
    expect(resolveCommandHref("generate-audiobook")).toBe(
      "/author/production?kind=audiobook"
    );
    expect(resolveCommandHref("translate-book")).toBe(
      "/author/production?kind=translation"
    );
    expect(resolveCommandHref("publish-book")).toBe(
      "/author/audience?surface=beta-readers"
    );
    expect(resolveCommandHref("create-campaign")).toBe(
      "/author/audience?surface=campaigns"
    );
    expect(resolveCommandHref("open-analytics")).toBe("/author/analytics");
  });
});

describe("resolveCommandHref — with bookId", () => {
  it("targets the specific book for every book-scoped action", () => {
    expect(resolveCommandHref("open-book", { bookId: BOOK_ID })).toBe(
      `/author/books/${BOOK_ID}`
    );
    expect(
      resolveCommandHref("generate-audiobook", { bookId: BOOK_ID })
    ).toBe(`/author/books/${BOOK_ID}?panel=audiobook`);
    expect(resolveCommandHref("translate-book", { bookId: BOOK_ID })).toBe(
      `/author/books/${BOOK_ID}?panel=translation`
    );
    expect(resolveCommandHref("publish-book", { bookId: BOOK_ID })).toBe(
      `/author/audience?bookId=${BOOK_ID}&surface=beta-readers`
    );
    expect(resolveCommandHref("create-campaign", { bookId: BOOK_ID })).toBe(
      `/author/audience?bookId=${BOOK_ID}&surface=campaigns`
    );
    expect(resolveCommandHref("open-analytics", { bookId: BOOK_ID })).toBe(
      `/author/analytics?bookId=${BOOK_ID}`
    );
  });

  it("ignores create-book's bookId (a new book has no id yet)", () => {
    expect(resolveCommandHref("create-book", { bookId: BOOK_ID })).toBe(
      "/author/library?action=create-book"
    );
  });

  it("treats whitespace-only / null bookId as missing", () => {
    expect(resolveCommandHref("open-book", { bookId: "   " })).toBe(
      "/author/library"
    );
    expect(resolveCommandHref("open-book", { bookId: null })).toBe(
      "/author/library"
    );
    expect(resolveCommandHref("open-book", {})).toBe("/author/library");
  });
});

describe("buildBookPickerCommands", () => {
  function book(overrides: Partial<AuthorShellBook> = {}): AuthorShellBook {
    return {
      id: BOOK_ID,
      title: "Nocturne",
      status: "Draft",
      updatedAt: null,
      ...overrides,
    };
  }

  it("produces stable id/label/keywords for a normal book", () => {
    const [command] = buildBookPickerCommands([book()]);
    expect(command).toEqual({
      id: `book-${BOOK_ID}`,
      label: "Nocturne",
      subtitle: "Open draft book",
      group: "Books",
      icon: "book",
      keywords: ["nocturne", "draft", "book"],
      book: book(),
    });
  });

  it("falls back to 'Untitled' for empty/whitespace titles", () => {
    const [a, b] = buildBookPickerCommands([
      book({ id: "a", title: null }),
      book({ id: "b", title: "   " }),
    ]);
    expect(a.label).toBe("Untitled");
    expect(a.keywords).toEqual(["untitled", "draft", "book"]);
    expect(b.label).toBe("Untitled");
  });

  it("uses a neutral subtitle and drops empty keywords when status is null", () => {
    const [command] = buildBookPickerCommands([
      book({ title: "Solstice", status: null }),
    ]);
    expect(command.subtitle).toBe("Open book");
    expect(command.keywords).toEqual(["solstice", "book"]);
  });

  it("returns an empty list for an empty input", () => {
    expect(buildBookPickerCommands([])).toEqual([]);
  });
});

describe("AUTHOR_ROOT_COMMANDS", () => {
  it("declares one entry per known AuthorShellCommandAction", () => {
    const ids = AUTHOR_ROOT_COMMANDS.map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        "create-book",
        "create-campaign",
        "generate-audiobook",
        "open-analytics",
        "open-book",
        "publish-book",
        "translate-book",
      ].sort()
    );
  });
});
