"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STORAGE_CURRENT_BOOK = "verkli_author_current_book";

export type AuthorWorkspace =
  | "home"
  | "library"
  | "production"
  | "audience"
  | "analytics";

export type ContextPanelState = {
  kind: string;
  payload?: Record<string, unknown>;
} | null;

export type AuthorShellBook = {
  id: string;
  title: string | null;
  status: string | null;
  updatedAt: string | null;
};

type AuthorWorkspaceState = {
  currentBookId: string | null;
  activeWorkspace: AuthorWorkspace;
  selectedJobId: string | null;
  contextPanelState: ContextPanelState;
};

type AuthorWorkspaceAction =
  | { type: "set-current-book"; bookId: string | null }
  | { type: "set-active-workspace"; workspace: AuthorWorkspace }
  | { type: "set-selected-job"; jobId: string | null }
  | { type: "set-context-panel"; panel: ContextPanelState };

type AuthorWorkspaceContextValue = {
  state: AuthorWorkspaceState;
  books: AuthorShellBook[];
  booksLoading: boolean;
  activeBook: AuthorShellBook | null;
  setCurrentBookId: (bookId: string | null) => void;
  setSelectedJobId: (jobId: string | null) => void;
  setContextPanelState: (panel: ContextPanelState) => void;
  clearContextPanelState: () => void;
  refreshBooks: () => Promise<void>;
};

const initialState: AuthorWorkspaceState = {
  currentBookId: null,
  activeWorkspace: "home",
  selectedJobId: null,
  contextPanelState: null,
};

const AuthorWorkspaceContext = createContext<AuthorWorkspaceContextValue | null>(null);

function reducer(state: AuthorWorkspaceState, action: AuthorWorkspaceAction): AuthorWorkspaceState {
  switch (action.type) {
    case "set-current-book":
      if (state.currentBookId === action.bookId) return state;
      return { ...state, currentBookId: action.bookId };
    case "set-active-workspace":
      if (state.activeWorkspace === action.workspace) return state;
      return { ...state, activeWorkspace: action.workspace };
    case "set-selected-job":
      if (state.selectedJobId === action.jobId) return state;
      return { ...state, selectedJobId: action.jobId };
    case "set-context-panel":
      if (state.contextPanelState === action.panel) return state;
      return { ...state, contextPanelState: action.panel };
    default:
      return state;
  }
}

function deriveWorkspace(pathname: string | null): AuthorWorkspace {
  if (!pathname) return "home";
  if (pathname.startsWith("/author/books") || pathname.startsWith("/author/write")) {
    return "production";
  }
  if (pathname.startsWith("/author/library")) {
    return "library";
  }
  if (pathname.startsWith("/author/production")) {
    return "production";
  }
  if (
    pathname.startsWith("/author/audience") ||
    pathname.startsWith("/author/marketing") ||
    pathname.startsWith("/author/publish") ||
    pathname.startsWith("/author/newsletters")
  ) {
    return "audience";
  }
  if (pathname.startsWith("/author/analytics") || pathname.startsWith("/author/stats")) {
    return "analytics";
  }
  return "home";
}

export function AuthorWorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [books, setBooks] = useState<AuthorShellBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);

  const refreshBooks = useCallback(async () => {
    setBooksLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setBooks([]);
        return;
      }

      const { data, error } = await supabase
        .from("books")
        .select("id, title, status, updated_at")
        .eq("author_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[author shell] failed to load books", {
          message: error.message,
          code: error.code,
        });
        setBooks([]);
        return;
      }

      setBooks(
        (data ?? []).map((book) => ({
          id: book.id,
          title: book.title ?? null,
          status: typeof book.status === "string" ? book.status : null,
          updatedAt: typeof book.updated_at === "string" ? book.updated_at : null,
        }))
      );
    } catch (error) {
      // AbortError is expected during React strict-mode remounts and navigation —
      // silently ignore it to avoid crashing the page or polluting the console.
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof Error && error.message === "signal is aborted without reason") return;
      console.error("[author shell] failed to refresh books", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      setBooks([]);
    } finally {
      setBooksLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBooks();
  }, [refreshBooks]);

  useEffect(() => {
    const handleRefresh = () => {
      void refreshBooks();
    };
    window.addEventListener("author-shell:refresh-books", handleRefresh);
    return () => window.removeEventListener("author-shell:refresh-books", handleRefresh);
  }, [refreshBooks]);

  useEffect(() => {
    dispatch({
      type: "set-active-workspace",
      workspace: deriveWorkspace(pathname),
    });
  }, [pathname]);

  useEffect(() => {
    const bookId =
      searchParams.get("bookId")?.trim() ||
      searchParams.get("book")?.trim() ||
      null;
    const jobId =
      searchParams.get("jobId")?.trim() ||
      searchParams.get("job")?.trim() ||
      null;

    const bookIdFromPath = pathname?.match(/^\/author\/books\/([^/?]+)/)?.[1] ?? null;
    const resolvedBookId = bookId ?? bookIdFromPath;

    if (resolvedBookId) {
      dispatch({ type: "set-current-book", bookId: resolvedBookId });
      window.sessionStorage.setItem(STORAGE_CURRENT_BOOK, resolvedBookId);
    } else if (!state.currentBookId) {
      const lastBookId = window.sessionStorage.getItem(STORAGE_CURRENT_BOOK);
      if (lastBookId) {
        dispatch({ type: "set-current-book", bookId: lastBookId });
      }
    }

    dispatch({ type: "set-selected-job", jobId });
  }, [pathname, searchParams, state.currentBookId]);

  useEffect(() => {
    if (booksLoading || !state.currentBookId) return;
    if (books.length === 0) return;
    if (books.some((book) => book.id === state.currentBookId)) return;
    dispatch({ type: "set-current-book", bookId: null });
    window.sessionStorage.removeItem(STORAGE_CURRENT_BOOK);
  }, [books, booksLoading, state.currentBookId]);

  const setCurrentBookId = useCallback((bookId: string | null) => {
    dispatch({ type: "set-current-book", bookId });
    if (bookId) {
      window.sessionStorage.setItem(STORAGE_CURRENT_BOOK, bookId);
      return;
    }
    window.sessionStorage.removeItem(STORAGE_CURRENT_BOOK);
  }, []);

  const setSelectedJobId = useCallback((jobId: string | null) => {
    dispatch({ type: "set-selected-job", jobId });
  }, []);

  const setContextPanelState = useCallback((panel: ContextPanelState) => {
    dispatch({ type: "set-context-panel", panel });
  }, []);

  const clearContextPanelState = useCallback(() => {
    dispatch({ type: "set-context-panel", panel: null });
  }, []);

  const activeBook = useMemo(
    () => books.find((book) => book.id === state.currentBookId) ?? null,
    [books, state.currentBookId]
  );

  const value = useMemo<AuthorWorkspaceContextValue>(
    () => ({
      state,
      books,
      booksLoading,
      activeBook,
      setCurrentBookId,
      setSelectedJobId,
      setContextPanelState,
      clearContextPanelState,
      refreshBooks,
    }),
    [
      activeBook,
      books,
      booksLoading,
      clearContextPanelState,
      refreshBooks,
      setContextPanelState,
      setCurrentBookId,
      setSelectedJobId,
      state,
    ]
  );

  return (
    <AuthorWorkspaceContext.Provider value={value}>
      {children}
    </AuthorWorkspaceContext.Provider>
  );
}

export function useAuthorWorkspace() {
  const context = useContext(AuthorWorkspaceContext);
  if (!context) {
    throw new Error("useAuthorWorkspace must be used within AuthorWorkspaceProvider");
  }
  return context;
}
