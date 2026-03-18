import type { AuthorShellBook } from "@/features/author-shell/workspace-state";

export type AuthorShellCommandAction =
  | "create-book"
  | "open-book"
  | "generate-audiobook"
  | "translate-book"
  | "publish-book"
  | "create-campaign"
  | "open-analytics";

export type AuthorShellCommandDefinition = {
  id: AuthorShellCommandAction;
  label: string;
  subtitle: string;
  group: "Create" | "Books" | "Production" | "Audience" | "Analytics";
  icon: string;
  keywords: string[];
};

export type AuthorShellBookCommand = {
  id: string;
  label: string;
  subtitle: string;
  group: "Books";
  icon: string;
  keywords: string[];
  book: AuthorShellBook;
};

export const AUTHOR_ROOT_COMMANDS: AuthorShellCommandDefinition[] = [
  {
    id: "create-book",
    label: "Create book",
    subtitle: "Start a new draft or import a manuscript",
    group: "Create",
    icon: "plus",
    keywords: ["new", "draft", "book", "create", "import"],
  },
  {
    id: "open-book",
    label: "Open book",
    subtitle: "Jump straight into the writing workspace",
    group: "Books",
    icon: "book",
    keywords: ["open", "book", "write", "draft"],
  },
  {
    id: "generate-audiobook",
    label: "Generate audiobook",
    subtitle: "Open production with audiobook generation selected",
    group: "Production",
    icon: "audio",
    keywords: ["audio", "tts", "narration", "production"],
  },
  {
    id: "translate-book",
    label: "Translate book",
    subtitle: "Open production with translation selected",
    group: "Production",
    icon: "languages",
    keywords: ["translate", "translation", "language", "production"],
  },
  {
    id: "publish-book",
    label: "Publish book",
    subtitle: "Open the audience workspace on publishing",
    group: "Audience",
    icon: "rocket",
    keywords: ["publish", "release", "audience"],
  },
  {
    id: "create-campaign",
    label: "Create campaign",
    subtitle: "Open the audience workspace on campaign tools",
    group: "Audience",
    icon: "megaphone",
    keywords: ["campaign", "marketing", "audience", "promotion"],
  },
  {
    id: "open-analytics",
    label: "Open analytics",
    subtitle: "Go to global or book-level analytics",
    group: "Analytics",
    icon: "chart",
    keywords: ["analytics", "stats", "performance", "growth"],
  },
];

export function buildBookPickerCommands(books: AuthorShellBook[]): AuthorShellBookCommand[] {
  return books.map((book) => ({
    id: `book-${book.id}`,
    label: book.title?.trim() || "Untitled",
    subtitle: book.status ? `Open ${book.status.toLowerCase()} book` : "Open book",
    group: "Books",
    icon: "book",
    keywords: [
      book.title?.trim().toLowerCase() || "untitled",
      book.status?.toLowerCase() || "",
      "book",
    ].filter(Boolean),
    book,
  }));
}

export function resolveCommandHref(
  action: AuthorShellCommandAction,
  options?: { bookId?: string | null }
) {
  const bookId = options?.bookId?.trim() || null;

  switch (action) {
    case "create-book":
      return "/author/library?action=create-book";
    case "open-book":
      return bookId ? `/author/write?bookId=${bookId}` : "/author/write";
    case "generate-audiobook":
      return bookId
        ? `/author/production?bookId=${bookId}&kind=audiobook`
        : "/author/production?kind=audiobook";
    case "translate-book":
      return bookId
        ? `/author/production?bookId=${bookId}&kind=translation`
        : "/author/production?kind=translation";
    case "publish-book":
      return bookId
        ? `/author/audience?bookId=${bookId}&surface=beta-readers`
        : "/author/audience?surface=beta-readers";
    case "create-campaign":
      return bookId
        ? `/author/audience?bookId=${bookId}&surface=campaigns`
        : "/author/audience?surface=campaigns";
    case "open-analytics":
      return bookId ? `/author/analytics?bookId=${bookId}` : "/author/analytics";
    default:
      return "/author/home";
  }
}
