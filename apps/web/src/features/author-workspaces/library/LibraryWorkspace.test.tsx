import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibraryBook } from "./library-model";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/features/author-shell/workspace-state", () => ({ useAuthorWorkspace: () => ({ setCurrentBookId: vi.fn() }) }));
vi.mock("@/components/books/CreateBookDialog", () => ({ default: () => null }));
vi.mock("@/components/books/DeleteBookButton", () => ({ default: () => null }));
vi.mock("@/components/notifications/NotificationBell", () => ({ default: () => null }));

const { default: LibraryWorkspace } = await import("./LibraryWorkspace");
const book: LibraryBook = { id: "draft-book", title: "Draft book", status: "DRAFT", description: null, updatedAt: null,
  coverImageUrl: null, audiobookStatus: null, chapterCount: 1, translationCount: 2 };

describe("library translation status", () => {
  it("describes counted translation rows as projects without claiming readiness", () => {
    const html = renderToStaticMarkup(<LibraryWorkspace books={[book]} />);
    expect(html).toContain("2 translation projects");
    expect(html).not.toContain("translations available");
    const singular = renderToStaticMarkup(<LibraryWorkspace books={[{ ...book, translationCount: 1 }]} />);
    expect(singular).toContain("1 translation project");
  });
});
