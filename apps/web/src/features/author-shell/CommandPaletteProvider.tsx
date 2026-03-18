"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import CommandPalette, {
  type CommandPaletteItem,
} from "@/components/editor/CommandPalette";
import {
  AUTHOR_ROOT_COMMANDS,
  buildBookPickerCommands,
  resolveCommandHref,
  type AuthorShellCommandAction,
} from "@/features/author-shell/command-registry";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";

type PaletteMode = "root" | "book-picker";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

export default function CommandPaletteProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const {
    state,
    books,
    booksLoading,
    activeBook,
    setCurrentBookId,
    refreshBooks,
  } = useAuthorWorkspace();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>("root");
  const [pendingAction, setPendingAction] = useState<AuthorShellCommandAction | null>(null);
  const [externalItems, setExternalItems] = useState<CommandPaletteItem[]>([]);
  const currentBookId = activeBook?.id ?? (booksLoading ? state.currentBookId : null);

  const openPalette = useCallback(() => {
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setMode("root");
    setPendingAction(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!open && isTypingTarget(event.target)) {
          return;
        }
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    const handleExternalOpen = () => {
      openPalette();
    };
    const handleExternalClose = () => {
      closePalette();
    };
    const handleSetItems = (event: Event) => {
      const customEvent = event as CustomEvent<CommandPaletteItem[]>;
      setExternalItems(Array.isArray(customEvent.detail) ? customEvent.detail : []);
    };
    const handleClearItems = () => {
      setExternalItems([]);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("author-shell:open-command-palette", handleExternalOpen);
    window.addEventListener("author-shell:close-command-palette", handleExternalClose);
    window.addEventListener("author-shell:set-command-items", handleSetItems as EventListener);
    window.addEventListener("author-shell:clear-command-items", handleClearItems);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("author-shell:open-command-palette", handleExternalOpen);
      window.removeEventListener("author-shell:close-command-palette", handleExternalClose);
      window.removeEventListener("author-shell:set-command-items", handleSetItems as EventListener);
      window.removeEventListener("author-shell:clear-command-items", handleClearItems);
    };
  }, [closePalette, open, openPalette]);

  useEffect(() => {
    if (!open) return;
    if (books.length > 0) return;
    void refreshBooks();
  }, [books.length, open, refreshBooks]);

  const navigateTo = useCallback(
    (href: string, bookId?: string | null) => {
      if (bookId) {
        setCurrentBookId(bookId);
      }
      router.push(href);
      closePalette();
    },
    [closePalette, router, setCurrentBookId]
  );

  const rootItems = useMemo<CommandPaletteItem[]>(() => {
    return AUTHOR_ROOT_COMMANDS.map((command) => ({
      id: command.id,
      label: command.label,
      subtitle: command.subtitle,
      group: command.group,
      icon: command.icon,
      keywords: command.keywords,
      onHighlight: () => {
        const href = resolveCommandHref(command.id, { bookId: currentBookId });
        router.prefetch(href);
      },
      onSelect: () => {
        if (command.id === "create-book") {
          navigateTo(resolveCommandHref(command.id));
          return;
        }

        if (command.id === "open-analytics" && !currentBookId) {
          navigateTo(resolveCommandHref(command.id));
          return;
        }

        if (currentBookId) {
          navigateTo(resolveCommandHref(command.id, { bookId: currentBookId }), currentBookId);
          return;
        }

        setMode("book-picker");
        setPendingAction(command.id);
      },
    }));
  }, [currentBookId, navigateTo, router]);

  const pickerItems = useMemo<CommandPaletteItem[]>(() => {
    return buildBookPickerCommands(books).map((command) => ({
      id: command.id,
      label: command.label,
      subtitle: pendingAction
        ? `${command.subtitle} · ${AUTHOR_ROOT_COMMANDS.find((item) => item.id === pendingAction)?.label ?? "Open"}`
        : command.subtitle,
      group: command.group,
      icon: command.icon,
      keywords: command.keywords,
      onHighlight: () => {
        router.prefetch(resolveCommandHref(pendingAction ?? "open-book", { bookId: command.book.id }));
      },
      onSelect: () => {
        const action = pendingAction ?? "open-book";
        navigateTo(resolveCommandHref(action, { bookId: command.book.id }), command.book.id);
      },
    }));
  }, [books, navigateTo, pendingAction, router]);

  const items = mode === "book-picker"
    ? pickerItems
    : [
        ...rootItems,
        ...externalItems.map((item) => ({
          ...item,
          group: item.group ?? "Editor",
        })),
      ];
  const loading = open && mode === "book-picker" && booksLoading;

  return (
    <>
      {children}
      <CommandPalette
        open={open}
        onClose={closePalette}
        items={items}
        loading={loading}
        placeholder={mode === "book-picker" ? "Select a book..." : "Search commands..."}
        emptyMessage={mode === "book-picker" ? "No books found" : "No commands found"}
        title={mode === "book-picker" ? "Choose book" : "Command palette"}
      />
    </>
  );
}
