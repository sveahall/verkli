import { describe, expect, it } from "vitest";

import {
  buildBookPickerCommands,
  resolveCommandHref,
  type AuthorShellCommandAction,
} from "./command-registry";

describe("buildBookPickerCommands", () => {
  it("maps each book to a command with stable id and label", () => {
    const result = buildBookPickerCommands([
      { id: "book-1", title: "Haunted Diary", status: "draft", updatedAt: null },
      { id: "book-2", title: "The Silent Watch", status: "published", updatedAt: null },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "book-book-1",
      label: "Haunted Diary",
      subtitle: "Open draft book",
      group: "Books",
      icon: "book",
    });
    expect(result[1]?.subtitle).toBe("Open published book");
  });

  it("falls back to 'Untitled' when title is empty / whitespace", () => {
    const [empty, whitespace] = buildBookPickerCommands([
      { id: "a", title: "", status: null, updatedAt: null },
      { id: "b", title: "   ", status: "draft", updatedAt: null },
    ]);

    expect(empty?.label).toBe("Untitled");
    expect(whitespace?.label).toBe("Untitled");
  });

  it("falls back to 'Open book' when status is missing", () => {
    const [cmd] = buildBookPickerCommands([
      { id: "a", title: "Untitled Story", status: null, updatedAt: null },
    ]);
    expect(cmd?.subtitle).toBe("Open book");
  });

  it("lowercases keywords and drops empty values", () => {
    const [cmd] = buildBookPickerCommands([
      { id: "a", title: "Mixed CASE Title", status: "Draft", updatedAt: null },
    ]);
    expect(cmd?.keywords).toEqual(["mixed case title", "draft", "book"]);
  });

  it("never emits an empty-string keyword (filter strips '' from missing status)", () => {
    const [cmd] = buildBookPickerCommands([
      { id: "a", title: "Solo", status: null, updatedAt: null },
    ]);
    expect(cmd?.keywords).not.toContain("");
  });

  it("returns an empty array for an empty input", () => {
    expect(buildBookPickerCommands([])).toEqual([]);
  });
});

describe("resolveCommandHref", () => {
  it("create-book ignores bookId", () => {
    expect(resolveCommandHref("create-book")).toBe(
      "/author/library?action=create-book"
    );
    expect(resolveCommandHref("create-book", { bookId: "book-1" })).toBe(
      "/author/library?action=create-book"
    );
  });

  it("open-book targets the book when bookId provided, library otherwise", () => {
    expect(resolveCommandHref("open-book", { bookId: "book-1" })).toBe(
      "/author/books/book-1"
    );
    expect(resolveCommandHref("open-book")).toBe("/author/library");
    expect(resolveCommandHref("open-book", { bookId: null })).toBe(
      "/author/library"
    );
    // Whitespace-only bookId should be treated as missing.
    expect(resolveCommandHref("open-book", { bookId: "   " })).toBe(
      "/author/library"
    );
  });

  it("production commands include panel param when bookId given", () => {
    expect(
      resolveCommandHref("generate-audiobook", { bookId: "b1" })
    ).toBe("/author/books/b1?panel=audiobook");
    expect(
      resolveCommandHref("translate-book", { bookId: "b1" })
    ).toBe("/author/books/b1?panel=translation");
  });

  it("production commands fall back to production routes without bookId", () => {
    expect(resolveCommandHref("generate-audiobook")).toBe(
      "/author/production?kind=audiobook"
    );
    expect(resolveCommandHref("translate-book")).toBe(
      "/author/production?kind=translation"
    );
  });

  it("audience commands attach bookId as query param", () => {
    expect(resolveCommandHref("publish-book", { bookId: "b1" })).toBe(
      "/author/audience?bookId=b1&surface=beta-readers"
    );
    expect(resolveCommandHref("create-campaign", { bookId: "b1" })).toBe(
      "/author/audience?bookId=b1&surface=campaigns"
    );
    expect(resolveCommandHref("publish-book")).toBe(
      "/author/audience?surface=beta-readers"
    );
  });

  it("open-analytics scopes per book when bookId given", () => {
    expect(resolveCommandHref("open-analytics", { bookId: "b1" })).toBe(
      "/author/analytics?bookId=b1"
    );
    expect(resolveCommandHref("open-analytics")).toBe("/author/analytics");
  });

  it("unknown action falls through to /author/home", () => {
    // Cast to bypass the type narrowing — the default branch is the
    // contract under test here.
    expect(
      resolveCommandHref("unknown-action" as AuthorShellCommandAction)
    ).toBe("/author/home");
  });
});
