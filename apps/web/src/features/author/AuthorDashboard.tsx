"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import ShelfTile from "@/components/library/ShelfTile";
import BookCard from "@/components/library/BookCard";

import { getShelves, createShelf, getStandaloneBooks } from "@/lib/supabase/shelves-client";
import type { ShelfWithDetails } from "@/lib/supabase/shelves-client";
import type { Tables } from "@/lib/supabase/types";
import { SHELF_GRADIENT_OPTIONS } from "@/lib/design/brand";

type Book = Tables<"books">;
import { getTranslationsEnabled } from "@/lib/flags";

const CreateBookDialog = dynamic(() => import("@/components/books/CreateBookDialog"), { ssr: false });


// ============================================
// DASHBOARD (for authenticated users)
// ============================================
export default function AuthorDashboard() {
  const router = useRouter();
  const createDropdownRef = useRef<HTMLDivElement>(null);
  const [shelves, setShelves] = useState<ShelfWithDetails[]>([]);
  const [standaloneBooks, setStandaloneBooks] = useState<Book[]>([]);
  const [loadingShelves, setLoadingShelves] = useState(true);
  // Modal states
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showShelfModal, setShowShelfModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookDialogMode, setBookDialogMode] = useState<"choice" | "write" | "import">("choice");
  const [showReviewShelfModal, setShowReviewShelfModal] = useState(false);
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);

  // Shelf form state
  const [shelfForm, setShelfForm] = useState({
    name: "",
    subtitle: "",
    cover: "",
    coverType: "image" as "image" | "gradient",
    coverGradient: "",
    typography: {
      fontFamily: "Inter",
      fontWeight: "600",
      titleSize: "20px",
      subtitleSize: "14px",
      textColor: "#ffffff",
    },
    description: "",
    authorsNote: "",
    tags: [] as string[],
  });
  


  useEffect(() => {
    loadShelves();
    
    // Listen for create dropdown event from GlobalNavbar
    const handleOpenCreate = () => {
      handleAddClick();
    };
    window.addEventListener('openCreateDropdown', handleOpenCreate);
    return () => window.removeEventListener('openCreateDropdown', handleOpenCreate);
  }, []);


  useEffect(() => {
    if (!showCreateDropdown) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Don't close if clicking inside the dropdown
      if (createDropdownRef.current && !createDropdownRef.current.contains(target)) {
        setShowCreateDropdown(false);
      }
    };
    
    // Use click event without capture - onClick handlers run first, then this
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showCreateDropdown]);

  const loadShelves = async () => {
    try {
      setLoadingShelves(true);
      const [shelvesData, booksData] = await Promise.all([
        getShelves().catch((err) => {
          console.warn("Error loading shelves (non-critical):", err);
          return [];
        }),
        getStandaloneBooks().catch((err) => {
          console.warn("Error loading standalone books (non-critical):", err);
          return [];
        }),
      ]);
      setShelves(shelvesData || []);
      setStandaloneBooks(booksData || []);
    } catch (error: unknown) {
      console.warn("Error loading shelves (non-critical):", error);
      // Set empty arrays on error to prevent UI crashes
      setShelves([]);
      setStandaloneBooks([]);
    } finally {
      setLoadingShelves(false);
    }
  };

  const libraryBooks = useMemo(() => {
    const shelfBooks = shelves.flatMap((shelf) =>
      (shelf.shelf_books || []).map((shelfBook) => shelfBook.book).filter(Boolean)
    );
    const combined = [...shelfBooks, ...standaloneBooks];
    const unique = new Map<string, Book>();
    combined.forEach((book) => {
      if (book) unique.set(book.id, book);
    });
    return Array.from(unique.values());
  }, [shelves, standaloneBooks]);

  const publishedCount = useMemo(
    () => libraryBooks.filter((book) => book.status === "PUBLISHED").length,
    [libraryBooks]
  );
  // Handle choice modal
  const handleAddClick = (shelfId?: string) => {
    setSelectedShelfId(shelfId || null);
    setShowChoiceModal(true);
  };
  
  const handleCreateShelf = () => {
    setShowChoiceModal(false);
    setShelfForm({ 
      name: "", 
      subtitle: "",
      cover: "", 
      coverType: "image",
      coverGradient: "",
      typography: {
        fontFamily: "Inter",
        fontWeight: "600",
        titleSize: "20px",
        subtitleSize: "14px",
        textColor: "#ffffff",
      },
      description: "", 
      authorsNote: "", 
      tags: [] 
    });
    setShowShelfModal(true);
  };
  
  const handleCreateBook = () => {
    setShowChoiceModal(false);
    setBookDialogMode("write");
    setShowBookModal(true);
  };

  const handleOpenImportModal = () => {
    setShowChoiceModal(false);
    setShowCreateDropdown(false);
    setBookDialogMode("import");
    setShowBookModal(true);
  };

  const handleShelfSubmit = () => {
    // Review shelf before finalizing
    setShowShelfModal(false);
    setShowReviewShelfModal(true);
  };
  
  const handleReviewShelfConfirm = async () => {
    try {
      // Create shelf in database
      const maxSortIndex = shelves.length > 0 
        ? Math.max(...shelves.map(s => s.sort_index))
        : -1;
      
      await createShelf({
        name: shelfForm.name || "New Shelf",
        subtitle: shelfForm.subtitle || null,
        cover_type: shelfForm.coverType,
        cover_url: shelfForm.coverType === "image" ? shelfForm.cover || null : null,
        cover_gradient: shelfForm.coverType === "gradient" ? shelfForm.coverGradient || null : null,
        typography: shelfForm.typography,
        sort_index: maxSortIndex + 1,
      });
      
      setShowReviewShelfModal(false);
      setShelfForm({ 
        name: "", 
        subtitle: "",
        cover: "", 
        coverType: "image",
        coverGradient: "",
        typography: {
          fontFamily: "Inter",
          fontWeight: "600",
          titleSize: "20px",
          subtitleSize: "14px",
          textColor: "#ffffff",
        },
        description: "", 
        authorsNote: "", 
        tags: [] 
      });
      
      // Reload shelves
      await loadShelves();
    } catch (error) {
      // Avoid Next.js console overlay – log as warning instead
      console.warn("Non-critical: error creating shelf", error);
    }
  };
  
  const handleBookCreated = async (bookId: string) => {
    try {
      if (selectedShelfId) {
        const supabase = createClient();
        await supabase
          .from("shelf_books")
          .insert({
            shelf_id: selectedShelfId,
            book_id: bookId,
            section_id: null,
            sort_index: 0,
          });
      }
      setSelectedShelfId(null);
      setShowBookModal(false);
      router.push(`/author/books/${bookId}`);
    } catch (error) {
      console.warn("Non-critical: error adding book to shelf", error);
      setShowBookModal(false);
      router.push(`/author/books/${bookId}`);
    }
  };
  
  const handleTagInput = (value: string, type: "shelf" | "book") => {
    const tags = value.split(",").map(t => t.trim()).filter(t => t);
    if (type === "shelf") {
      setShelfForm({ ...shelfForm, tags });
    }
    // Book tags removed - editing happens in dedicated page
  };

  return (
    <main className="min-h-screen bg-white text-foreground dark:bg-[#0A0A0B]">
      <div className="mx-auto max-w-[1200px] px-4 pt-6 pb-24 sm:px-6 sm:pt-10">

        {/* Header */}
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#1a1a1a] sm:text-[32px] dark:text-[#ededed]">
              My library
            </h1>
            {!loadingShelves && (shelves.length > 0 || standaloneBooks.length > 0) && (
              <p className="mt-1 text-[14px] text-[#8a8a8a] dark:text-[#555]">
                {libraryBooks.length} {libraryBooks.length === 1 ? "book" : "books"} &middot; {shelves.length} {shelves.length === 1 ? "shelf" : "shelves"} &middot; {publishedCount} published
              </p>
            )}
          </div>
          <div className="relative" ref={createDropdownRef}>
            <button
              onClick={() => setShowCreateDropdown(!showCreateDropdown)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-80 active:opacity-70 dark:bg-[#ededed] dark:text-[#0A0A0B]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create
            </button>
            {showCreateDropdown && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-[200px] rounded-xl border border-[#e8e8e8] bg-white p-1 shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:border-[#1e1e1e] dark:bg-[#141415] dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <button
                  onClick={() => { setShowCreateDropdown(false); handleCreateShelf(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[#4a4a4a] transition-colors hover:bg-[#f5f5f5] dark:text-[#999] dark:hover:bg-[#1e1e1e]"
                >
                  <svg className="h-4 w-4 text-[#8a8a8a] dark:text-[#666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  New shelf
                </button>
                <button
                  onClick={() => { setShowCreateDropdown(false); handleCreateBook(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[#4a4a4a] transition-colors hover:bg-[#f5f5f5] dark:text-[#999] dark:hover:bg-[#1e1e1e]"
                >
                  <svg className="h-4 w-4 text-[#8a8a8a] dark:text-[#666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Write book
                </button>
                <button
                  onClick={() => { setShowCreateDropdown(false); handleOpenImportModal(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[#4a4a4a] transition-colors hover:bg-[#f5f5f5] dark:text-[#999] dark:hover:bg-[#1e1e1e]"
                >
                  <svg className="h-4 w-4 text-[#8a8a8a] dark:text-[#666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Import book
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Thin gradient accent line */}
        <div className="mb-10 h-px bg-gradient-to-r from-[#907AFF]/20 via-[#E29ED5]/20 to-[#FCC997]/20" />

        {/* Translations notice */}
        {!getTranslationsEnabled() && (
          <div className="mb-8 border-l-2 border-[#e0e0e0] py-1 pl-4 dark:border-[#2a2a2a]">
            <p className="text-[13px] text-[#8a8a8a] dark:text-[#555]">
              Translations &mdash; not available on your current plan.
            </p>
          </div>
        )}

        {/* Content */}
        {loadingShelves ? (
          <div className="flex justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#e0e0e0] border-t-[#1a1a1a] dark:border-[#333] dark:border-t-[#ededed]" />
          </div>
        ) : shelves.length === 0 && standaloneBooks.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center py-24 text-center">
            <svg className="mb-4 h-12 w-12 text-[#ccc] dark:text-[#333]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="text-[15px] text-[#8a8a8a] dark:text-[#555]">
              Your library is empty
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={handleCreateBook}
                className="rounded-lg bg-[#1a1a1a] px-5 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-80 dark:bg-[#ededed] dark:text-[#0A0A0B]"
              >
                Write new book
              </button>
              <button
                onClick={handleOpenImportModal}
                className="rounded-lg border border-[#e0e0e0] px-5 py-2.5 text-[13px] font-medium text-[#4a4a4a] transition-colors hover:border-[#ccc] hover:bg-[#fafafa] dark:border-[#2a2a2a] dark:text-[#999] dark:hover:border-[#3a3a3a] dark:hover:bg-[#141415]"
              >
                Import book
              </button>
            </div>
          </div>
        ) : (
          /* Unified grid — shelves, books, and "create new" card together */
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {/* Shelf tiles first */}
            {shelves.map((shelf) => (
              <div key={shelf.id} className="w-full">
                <ShelfTile
                  shelf={shelf}
                  bookCount={shelf.shelf_books?.length || 0}
                  onClick={() => router.push(`/author/library/${shelf.id}`)}
                />
              </div>
            ))}

            {/* Book cards */}
            {standaloneBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                size="md"
                onClick={() => router.push(`/author/books/${book.id}`)}
                showStats={false}
              />
            ))}

            {/* Create new card */}
            <button
              onClick={() => setShowChoiceModal(true)}
              className="group flex aspect-[220/320] w-full items-center justify-center rounded-2xl border border-dashed border-[#ddd] bg-gradient-to-br from-[#907AFF]/[0.04] to-[#E29ED5]/[0.04] transition-all hover:border-[#bbb] hover:from-[#907AFF]/[0.08] hover:to-[#E29ED5]/[0.08] dark:border-[#222] dark:from-[#907AFF]/[0.02] dark:to-[#E29ED5]/[0.02] dark:hover:border-[#333] dark:hover:from-[#907AFF]/[0.06] dark:hover:to-[#E29ED5]/[0.06]"
            >
              <div className="flex flex-col items-center gap-2">
                <svg className="h-6 w-6 text-[#bbb] transition-colors group-hover:text-[#907AFF] dark:text-[#444] dark:group-hover:text-[#907AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-[13px] font-medium text-[#aaa] transition-colors group-hover:text-[#907AFF] dark:text-[#444] dark:group-hover:text-[#907AFF]">Create new</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Choice Modal - Shelf or Book */}
      {showChoiceModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowChoiceModal(false)}>
          <div className="relative w-full max-w-[600px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/[0.95] dark:bg-[#0a0a0f]/[0.95] p-8 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Close" onClick={() => setShowChoiceModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="mb-6 text-[28px] font-semibold text-slate-900 dark:text-white">Create new</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <button onClick={handleCreateShelf} className="group rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                  <svg className="h-6 w-6 text-[#907AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </div>
                <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">Create Shelf</h3>
                <p className="text-[14px] text-slate-600 dark:text-white/50">Organize your books into collections (e.g., book series)</p>
              </button>
              <button onClick={handleCreateBook} className="group rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#E29ED5]/20 to-[#FCC997]/20">
                  <svg className="h-6 w-6 text-[#E29ED5]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">Write new book</h3>
                <p className="text-[14px] text-slate-600 dark:text-white/50">Create a new book and start writing</p>
              </button>
              <button onClick={handleOpenImportModal} className="group rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FCC997]/20 to-[#FEE9A3]/20">
                  <svg className="h-6 w-6 text-[#FCC997]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">Import book</h3>
                <p className="text-[14px] text-slate-600 dark:text-white/50">Upload an existing book file (epub, docx, html, txt)</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shelf Creation Modal */}
      {showShelfModal && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto pt-20">
          <div className="relative my-8 w-full max-w-[800px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/[0.95] dark:bg-[#0a0a0f]/[0.95] p-10 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Close" onClick={() => setShowShelfModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="mb-8 text-[24px] font-semibold text-slate-900 dark:text-white">Create new shelf</h2>
            <div className="mb-8 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={shelfForm.name}
                  onChange={(e) => setShelfForm({ ...shelfForm, name: e.target.value })}
                  placeholder="Shelf name"
                  className="flex-1 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[20px] font-semibold text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/[0.01] dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                />
                <svg className="h-5 w-5 text-slate-400 dark:text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </div>
              <input
                type="text"
                value={shelfForm.subtitle}
                onChange={(e) => setShelfForm({ ...shelfForm, subtitle: e.target.value })}
                placeholder="Optional subtitle"
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/[0.01] dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
              />
            </div>
            
            <div className="space-y-6">
              {/* Cover Chooser */}
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-[15px] font-semibold text-slate-900 dark:text-white">Cover</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShelfForm({ ...shelfForm, coverType: "image" })}
                      className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-all ${
                        shelfForm.coverType === "image"
                          ? "bg-[#907AFF] text-white"
                          : "bg-black/[0.02] dark:bg-white/[0.02] text-slate-600 dark:text-white/70 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      Image
                    </button>
                    <button
                      onClick={() => setShelfForm({ ...shelfForm, coverType: "gradient" })}
                      className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-all ${
                        shelfForm.coverType === "gradient"
                          ? "bg-[#907AFF] text-white"
                          : "bg-black/[0.02] dark:bg-white/[0.02] text-slate-600 dark:text-white/70 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                </div>
                
                {shelfForm.coverType === "image" ? (
                  <>
                    <button className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]">
                      <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add shelf cover</span>
                      <input type="file" accept="image/*" className="hidden" id="shelf-cover" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => setShelfForm({ ...shelfForm, cover: e.target?.result as string });
                          reader.readAsDataURL(file);
                        }
                      }} />
                      <label htmlFor="shelf-cover" className="cursor-pointer rounded-lg bg-[#907AFF]/10 px-3 py-1.5 text-[13px] font-medium text-[#907AFF] transition-colors hover:bg-[#907AFF]/20">Upload</label>
                    </button>
                    {shelfForm.cover && (
                      <div className="relative mt-2 h-48 w-32 overflow-hidden rounded-lg">
                        <Image
                          src={shelfForm.cover}
                          alt="Shelf cover"
                          fill
                          unoptimized
                          sizes="128px"
                          className="object-cover"
                        />
                        <button type="button" aria-label="Remove cover image" onClick={() => setShelfForm({ ...shelfForm, cover: "" })} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:bg-black/80">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-2">
                      {SHELF_GRADIENT_OPTIONS.map((gradient, i) => (
                        <button
                          key={i}
                          onClick={() => setShelfForm({ ...shelfForm, coverGradient: gradient })}
                          className={`h-16 rounded-lg transition-all ${
                            shelfForm.coverGradient === gradient ? "ring-2 ring-[#907AFF] ring-offset-2" : ""
                          }`}
                          style={{ background: gradient }}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      value={shelfForm.coverGradient}
                      onChange={(e) => setShelfForm({ ...shelfForm, coverGradient: e.target.value })}
                    placeholder="Or enter custom gradient CSS"
                    className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/[0.01] dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                    />
                  </div>
                )}
              </div>

              {/* Typography Settings */}
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-5">
                <h4 className="mb-5 text-[15px] font-semibold text-slate-900 dark:text-white">Typography Settings</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Font Family</label>
                    <select
                      value={shelfForm.typography.fontFamily}
                      onChange={(e) => setShelfForm({ ...shelfForm, typography: { ...shelfForm.typography, fontFamily: e.target.value } })}
                      className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
                    >
                      <option value="Inter">Inter</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Font Weight</label>
                    <select
                      value={shelfForm.typography.fontWeight}
                      onChange={(e) => setShelfForm({ ...shelfForm, typography: { ...shelfForm.typography, fontWeight: e.target.value } })}
                      className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
                    >
                      <option value="400">Regular (400)</option>
                      <option value="500">Medium (500)</option>
                      <option value="600">Semibold (600)</option>
                      <option value="700">Bold (700)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Title Size</label>
                      <input
                        type="text"
                        value={shelfForm.typography.titleSize}
                        onChange={(e) => setShelfForm({ ...shelfForm, typography: { ...shelfForm.typography, titleSize: e.target.value } })}
                        placeholder="20px"
                        className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Subtitle Size</label>
                      <input
                        type="text"
                        value={shelfForm.typography.subtitleSize}
                        onChange={(e) => setShelfForm({ ...shelfForm, typography: { ...shelfForm.typography, subtitleSize: e.target.value } })}
                        placeholder="14px"
                        className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={shelfForm.typography.textColor}
                        onChange={(e) => setShelfForm({ ...shelfForm, typography: { ...shelfForm.typography, textColor: e.target.value } })}
                        className="h-10 w-20 cursor-pointer rounded-lg border border-black/10 dark:border-white/10 transition-all hover:ring-2 hover:ring-[#907AFF]/30"
                      />
                      <input
                        type="text"
                        value={shelfForm.typography.textColor}
                        onChange={(e) => setShelfForm({ ...shelfForm, typography: { ...shelfForm.typography, textColor: e.target.value } })}
                        placeholder="#ffffff"
                        className="flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <button 
                  onClick={() => setShelfForm({ ...shelfForm, description: shelfForm.description ? "" : " " })}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add summary</span>
                </button>
                {shelfForm.description && (
                  <textarea
                    value={shelfForm.description}
                    onChange={(e) => setShelfForm({ ...shelfForm, description: e.target.value })}
                    placeholder="Describe your shelf..."
                    className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/[0.01] dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                    rows={4}
                    autoFocus
                  />
                )}
              </div>

              {/* Author's Note */}
              <div>
                <button 
                  onClick={() => setShelfForm({ ...shelfForm, authorsNote: shelfForm.authorsNote ? "" : " " })}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add author&apos;s note</span>
                </button>
                {shelfForm.authorsNote && (
                  <textarea
                    value={shelfForm.authorsNote}
                    onChange={(e) => setShelfForm({ ...shelfForm, authorsNote: e.target.value })}
                    placeholder="Add a personal note about this shelf..."
                    className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/[0.01] dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                    rows={3}
                    autoFocus
                  />
                )}
              </div>

              {/* Tags */}
              <div>
                <button 
                  onClick={() => {
                    const input = document.getElementById("shelf-tags-input") as HTMLInputElement;
                    if (input) input.focus();
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add general tags</span>
                </button>
                {shelfForm.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {shelfForm.tags.map((tag, i) => (
                      <span key={i} className="flex items-center gap-2 rounded-full bg-[#907AFF]/20 px-3 py-1 text-[13px] text-[#907AFF]">
                        {tag}
                        <button type="button" aria-label="Remove tag" onClick={() => setShelfForm({ ...shelfForm, tags: shelfForm.tags.filter((_, idx) => idx !== i) })} className="text-[#907AFF]/60 hover:text-[#907AFF]">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  id="shelf-tags-input"
                  type="text"
                    placeholder="Enter tags separated by commas, then press Enter..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const value = (e.target as HTMLInputElement).value;
                      if (value.trim()) {
                        handleTagInput(value, "shelf");
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/[0.01] dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                />
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-3 border-t border-black/10 dark:border-white/10 pt-6">
              <button onClick={() => setShowShelfModal(false)} className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-6 py-3 text-[14px] font-semibold text-slate-700 dark:text-white/70 transition-all hover:bg-black/[0.01] dark:hover:bg-white/[0.04]">
                Cancel
              </button>
              <button onClick={handleShelfSubmit} className="rounded-xl bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-6 py-3 text-[14px] font-semibold text-white transition-all hover:from-[#8069EE] hover:to-[#7058DD]">
                Review shelf
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Shelf Modal */}
      {showReviewShelfModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative my-8 w-full max-w-[700px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/[0.95] dark:bg-[#0a0a0f]/[0.95] p-8 backdrop-blur-xl">
            <button type="button" aria-label="Close" onClick={() => setShowReviewShelfModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="mb-6 text-[28px] font-semibold text-slate-900 dark:text-white">Review shelf</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-[16px] font-medium text-slate-900 dark:text-white">{shelfForm.name || "New shelf"}</h3>
                {shelfForm.cover && (
                  <div className="relative mb-4 h-48 w-32 overflow-hidden rounded-lg">
                    <Image
                      src={shelfForm.cover}
                      alt="Shelf cover"
                      fill
                      unoptimized
                      sizes="128px"
                      className="object-cover"
                    />
                  </div>
                )}
                {shelfForm.description && (
                  <p className="mb-4 text-[14px] text-slate-700 dark:text-white/70">{shelfForm.description}</p>
                )}
                {shelfForm.authorsNote && (
                  <div className="mb-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-4">
                    <p className="mb-1 text-[12px] font-medium text-slate-500 dark:text-white/50">Author&apos;s Note</p>
                    <p className="text-[14px] text-slate-700 dark:text-white/70">{shelfForm.authorsNote}</p>
                  </div>
                )}
                {shelfForm.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {shelfForm.tags.map((tag, i) => (
                      <span key={i} className="rounded-full bg-[#907AFF]/20 px-3 py-1 text-[13px] text-[#907AFF]">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => { setShowReviewShelfModal(false); setShowShelfModal(true); }} className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-6 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/[0.01] dark:hover:bg-white/[0.04]">
                Edit
              </button>
              <button onClick={handleReviewShelfConfirm} className="rounded-xl bg-[#907AFF] px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#8069EE]">
                Create shelf
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateBookDialog
        open={showBookModal}
        initialMode={bookDialogMode}
        onClose={() => setShowBookModal(false)}
        onCreated={(bookId) => handleBookCreated(bookId)}
        onImported={(bookId) => handleBookCreated(bookId)}
      />
    </main>
  );
}
