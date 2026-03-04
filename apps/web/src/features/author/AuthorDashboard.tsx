"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvatarUrlFromPath } from "@/lib/supabase/storage";
import ShelfTile from "@/components/library/ShelfTile";
import BookCard from "@/components/library/BookCard";
import BrandGradientText from "@/components/ui/brand-gradient-text";
import { getShelves, createShelf, getStandaloneBooks } from "@/lib/supabase/shelves-client";
import type { ShelfWithDetails } from "@/lib/supabase/shelves-client";
import type { Tables } from "@/lib/supabase/types";
import { SHELF_GRADIENT_OPTIONS } from "@/lib/design/brand";

type Book = Tables<"books">;
import type { User } from "@supabase/supabase-js";
import { getTranslationsEnabled } from "@/lib/flags";

const CreateBookDialog = dynamic(() => import("@/components/books/CreateBookDialog"), { ssr: false });

type EmptyStateCardProps = {
  children: ReactNode;
};

function EmptyStateCard({ children }: EmptyStateCardProps) {
  return (
    <div className="flex min-h-[140px] w-full items-center justify-center rounded-2xl border border-dashed border-black/[0.06] px-6 py-8 text-[14px] text-slate-400 dark:border-white/[0.06] dark:text-white/30">
      {children}
    </div>
  );
}

type Featuredauthor = {
  id: string;
  name: string;
  avatar?: string | null;
};

type BookCardData = {
  id: string;
  title: string;
  author: string;
  cover?: string | null;
  reads?: number;
  chapters?: number;
  rating?: number;
  tag?: string;
  progress?: number;
  currentChapter?: number;
  currentPage?: number;
  totalPages?: number;
};

type BookCardSize = "sm" | "md" | "lg";

const formatCompactNumber = (value?: number) => {
  if (!value && value !== 0) return "--";
  if (value < 1000) return value.toString();
  const formatted = (value / 1000).toFixed(1);
  return `${formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted}K`;
};

const getPagesLeft = (book: BookCardData) => {
  if (!book.totalPages || !book.currentPage) return undefined;
  return Math.max(book.totalPages - book.currentPage, 0);
};

const cardSizeStyles: Record<BookCardSize, { container: string; title: string; author: string; overlayPad: string }> = {
  sm: {
    container: "h-[200px] w-[140px] rounded-2xl",
    title: "text-[14px]",
    author: "text-[12px]",
    overlayPad: "px-3.5 py-3",
  },
  md: {
    container: "h-[280px] w-[200px] rounded-2xl",
    title: "text-[16px]",
    author: "text-[13px]",
    overlayPad: "px-4 py-3.5",
  },
  lg: {
    container: "h-[320px] w-[220px] rounded-2xl",
    title: "text-[18px]",
    author: "text-[14px]",
    overlayPad: "px-5 py-4",
  },
};

function BookCoverCard({
  book,
  size = "md",
  showTag = false,
  showProgress = false,
}: {
  book: BookCardData;
  size?: BookCardSize;
  showTag?: boolean;
  showProgress?: boolean;
}) {
  const styles = cardSizeStyles[size];
  const pagesLeft = getPagesLeft(book);
  const percentLeft = typeof book.progress === "number" ? Math.max(100 - book.progress, 0) : undefined;

  return (
    <Link
      href={`/author/books/${book.id}`}
      className="group relative flex-shrink-0 transition-transform duration-300 hover:-translate-y-1.5"
    >
      <div
        className={`relative overflow-hidden ${styles.container} bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-all duration-500 group-hover:scale-[1.02]`}
      >
        {book.cover ? (
          <Image
            src={book.cover}
            alt={book.title}
            fill
            unoptimized
            sizes="(max-width: 768px) 140px, (max-width: 1280px) 200px, 220px"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20 text-white/70">
            <span className="text-[12px] font-medium">No cover</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#907AFF]/0 via-[#907AFF]/0 to-[#907AFF]/0 transition-all duration-500 group-hover:from-[#907AFF]/10 group-hover:via-[#E29ED5]/5 group-hover:to-transparent" />

        {showTag && book.tag && (
          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
              {book.tag}
            </span>
          </div>
        )}

        <div className="absolute right-3 top-3 opacity-0 transition-all duration-300 group-hover:opacity-100">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/[0.02] text-white/80 backdrop-blur-sm">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div
            className={`keep-white rounded-2xl border border-white/20 bg-gradient-to-t from-black/95 via-black/90 to-black/80 backdrop-blur-xl ${styles.overlayPad} text-white transition-all duration-300`}
          >
            <div className="space-y-1.5">
              <h3 className={`${styles.title} line-clamp-2 font-bold leading-tight text-white drop-shadow-lg`}>
                {book.title}
              </h3>
              <p className={`${styles.author} line-clamp-1 text-white/90 font-medium`}>
                {book.author}
              </p>
            </div>

            {!showProgress && (
              <div className="mt-3 overflow-hidden transition-all duration-300 ease-out max-h-0 opacity-0 translate-y-2 group-hover:max-h-28 group-hover:opacity-100 group-hover:translate-y-0 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between gap-3 text-[12px] text-white/80">
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span className="font-medium">{formatCompactNumber(book.reads)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span className="font-medium">{book.chapters ?? "--"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="font-medium">{book.rating?.toFixed(1) ?? "--"}</span>
                  </div>
                </div>
              </div>
            )}

            {showProgress && (
              <div className="mt-3 space-y-2.5 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-[12px] font-medium text-white/90">
                  <span>Chapter {book.currentChapter ?? "--"}</span>
                  <span>Page {book.currentPage ?? "--"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/[0.02] backdrop-blur-sm">
                  <div
                    className="h-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] transition-all duration-500"
                    style={{ width: `${book.progress ?? 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-white/70">
                  <span>{percentLeft ?? "--"}% left</span>
                  <span>{pagesLeft ?? "--"} pages</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ============================================
// DASHBOARD (for authenticated users)
// ============================================
export default function AuthorDashboard({ user }: { user: User }) {
  const router = useRouter();
  const createDropdownRef = useRef<HTMLDivElement>(null);
  const [shelves, setShelves] = useState<ShelfWithDetails[]>([]);
  const [standaloneBooks, setStandaloneBooks] = useState<Book[]>([]);
  const [loadingShelves, setLoadingShelves] = useState(true);
  const [featuredauthors, setFeaturedauthors] = useState<Featuredauthor[]>([]);
  
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
    const supabase = createClient();
    const loadauthors = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .eq("role", "author")
        .eq("is_public", true)
        .limit(8);

      if (!error && data) {
        const authorsWithUrls = await Promise.all(
          data.map(async (author) => ({
            id: author.user_id,
            name: author.display_name || "author",
            avatar: (await getAvatarUrlFromPath(author.avatar_url, supabase)) ?? author.avatar_url ?? null,
          }))
        );
        setFeaturedauthors(authorsWithUrls);
      }
    };

    loadauthors();
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

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "author";

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

  const libraryCards = useMemo<BookCardData[]>(() => {
    return libraryBooks.map((book) => ({
      id: book.id,
      title: book.title,
      author: displayName,
      cover: book.cover_image,
      tag: book.status || undefined,
    }));
  }, [libraryBooks, displayName]);

  const publishedLibraryCards = useMemo(
    () => libraryCards.filter((book) => book.tag === "PUBLISHED"),
    [libraryCards]
  );
  const draftLibraryCards = useMemo(
    () => libraryCards.filter((book) => book.tag === "DRAFT"),
    [libraryCards]
  );
  const standalonePublishedBooks = useMemo(
    () => standaloneBooks.filter((book) => book.status === "PUBLISHED"),
    [standaloneBooks]
  );

  const continueReadingCards = publishedLibraryCards.slice(0, 6);
  const trendingCards = publishedLibraryCards.slice(0, 8);
  const discoverCards = publishedLibraryCards.slice(8, 16);
  
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
    <main className="min-h-screen bg-background text-foreground">

      {/* Hero banner — overlap matches navbar height (header pt-3 + 68px + pb-2 = 88px) */}
      <section className="relative -mt-[88px] pt-20 overflow-hidden border-b border-black/[0.04] dark:border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#eeeaf6] via-[#f0ecf7] to-background dark:from-[#0c0a18] dark:via-[#0a0914] dark:to-background" />
          {/* Top-left orb — extends behind navbar */}
          <div className="absolute -left-[5%] -top-[10%] h-[550px] w-[550px] rounded-full bg-[#907AFF]/20 blur-[130px] dark:bg-[#907AFF]/12" />
          {/* Top-right orb */}
          <div className="absolute -right-[5%] -top-[5%] h-[450px] w-[450px] rounded-full bg-[#6C5CE7]/15 blur-[120px] dark:bg-[#6C5CE7]/10" />
          {/* Center orb */}
          <div className="absolute left-[40%] top-[35%] h-[400px] w-[400px] rounded-full bg-[#4F46E5]/12 blur-[110px] dark:bg-[#4F46E5]/8" />
          {/* Bottom accent */}
          <div className="absolute bottom-[-5%] right-[20%] h-[300px] w-[300px] rounded-full bg-[#818CF8]/10 blur-[90px] dark:bg-[#818CF8]/6" />
        </div>
        <div className="relative mx-auto max-w-[1400px] px-6 pb-16 pt-[120px] text-center">
          <h1 className="text-[clamp(36px,5vw,56px)] font-bold tracking-[-0.04em] text-slate-900 dark:text-white">
            {displayName}
            <BrandGradientText className="ml-1">
              &apos;s world
            </BrandGradientText>
          </h1>
          <p className="mx-auto mt-4 max-w-[480px] text-[clamp(14px,1.2vw,17px)] leading-[1.6] text-slate-500 dark:text-white/50">
            Curate shelves, experiment with new books, and keep everything you&apos;re writing in one calm workspace.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] px-6 pt-12 pb-16">

        {/* Translations (feature-flagged disabled state) */}
        {!getTranslationsEnabled() && (
          <section className="mb-8">
            <div className="rounded-2xl border border-black/[0.06] bg-white/50 px-6 py-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Translations</h3>
              <p className="mt-1 text-[13px] text-slate-500 dark:text-white/40">Not available on your current plan.</p>
            </div>
          </section>
        )}

        {/* My Library */}
        <section className="mb-20">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-[24px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">My library</h2>
            <div className="relative" ref={createDropdownRef}>
              <button 
                onClick={() => setShowCreateDropdown(!showCreateDropdown)} 
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-all hover:bg-slate-800 hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create
              </button>
              {showCreateDropdown && (
                <div className="absolute right-0 top-full mt-2 w-[200px] overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-white/[0.95] dark:bg-[#0a0a0f]/[0.95] p-2 backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setShowCreateDropdown(false);
                      handleCreateShelf();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] text-slate-700 dark:text-white/70 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                      <svg className="h-4 w-4 text-[#907AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium">Create shelf</div>
                      <div className="text-[12px] text-slate-500 dark:text-white/50">Organize books</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateDropdown(false);
                      handleCreateBook();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] text-slate-700 dark:text-white/70 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#E29ED5]/20 to-[#FCC997]/20">
                      <svg className="h-4 w-4 text-[#E29ED5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium">Write new book</div>
                      <div className="text-[12px] text-slate-500 dark:text-white/50">Create a new book</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateDropdown(false);
                      handleOpenImportModal();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] text-slate-700 dark:text-white/70 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FCC997]/20 to-[#FEE9A3]/20">
                      <svg className="h-4 w-4 text-[#FCC997]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium">Import book</div>
                      <div className="text-[12px] text-slate-500 dark:text-white/50">Upload epub, docx, html, txt</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {shelves.length === 0 && standaloneBooks.length === 0 ? (
            // Empty state with two large actions
            <div className="rounded-[24px] border border-black/[0.05] bg-white/70 p-12 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.015] dark:shadow-[0_1px_3px_rgba(255,255,255,0.02)]">
              <div className="grid gap-6 md:grid-cols-2">
                <button
                  onClick={handleCreateShelf}
                  className="group flex h-[300px] w-auto flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-black/[0.06] transition-all duration-300 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.03]"
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 transition-colors group-hover:bg-slate-200 dark:bg-white/[0.06] dark:group-hover:bg-white/[0.1]">
                    <svg className="h-6 w-6 text-slate-500 dark:text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">New shelf</h3>
                  <p className="max-w-[200px] text-center text-[14px] text-slate-500 dark:text-white/40">
                    Organize your books into collections
                  </p>
                </button>
                
                <button
                  onClick={handleCreateBook}
                  className="group flex h-[300px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-black/[0.06] transition-all duration-300 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.03]"
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 transition-colors group-hover:bg-slate-200 dark:bg-white/[0.06] dark:group-hover:bg-white/[0.1]">
                    <svg className="h-6 w-6 text-slate-500 dark:text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">Write new book</h3>
                  <p className="max-w-[200px] text-center text-[14px] text-slate-500 dark:text-white/40">
                    Create a new book and start writing
                  </p>
                </button>
              </div>
            </div>
          ) : (
            // Shelves grid
            <div className="rounded-[24px] border border-black/[0.05] bg-white/70 p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.015] dark:shadow-[0_1px_3px_rgba(255,255,255,0.02)]">
              {loadingShelves ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#907AFF]"></div>
                </div>
              ) : (
                <div className="mb-6">
                  <h3 className="mb-5 text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/40">Shelves</h3>
                  <div className="flex flex-wrap gap-4">
                    {shelves.map((shelf) => (
                      <div key={shelf.id} className="shrink-0 w-[220px]">
                        <ShelfTile
                          shelf={shelf}
                          bookCount={shelf.shelf_books?.length || 0}
                          onClick={() => router.push(`/author/library/${shelf.id}`)}
                        />
                      </div>
                    ))}
                    <button
                      onClick={handleCreateShelf}
                      className="flex h-[320px] w-[220px] shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-black/[0.06] transition-all duration-300 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.03]"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <svg className="h-8 w-8 text-slate-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-[14px] text-slate-600 dark:text-white/50">New shelf</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
              
              {/* Standalone books section */}
              {(standaloneBooks.length > 0 || !loadingShelves) && (
                <div className="mt-8 border-t border-black/[0.05] pt-8 dark:border-white/[0.05]">
                  <h3 className="mb-5 text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/40">Standalone books</h3>
                  <div className="flex flex-wrap gap-4">
                    {standalonePublishedBooks.length > 0 ? (
                      standalonePublishedBooks.map((book) => (
                        <div key={book.id} className="shrink-0">
                          <BookCard
                            book={book}
                            size="sm"
                            onClick={() => router.push(`/author/books/${book.id}`)}
                            showStats={false}
                          />
                        </div>
                      ))
                    ) : (
                      <p className="text-[13px] text-slate-600 dark:text-white/50">
                        No published standalone books yet.
                      </p>
                    )}
                    <button
                      onClick={handleCreateBook}
                      className="flex h-[200px] w-[140px] shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-black/[0.06] transition-all duration-300 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.03]"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <svg className="h-8 w-8 text-slate-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-[11px] text-slate-500 dark:text-white/30">Add book</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {draftLibraryCards.length > 0 && (
                <div className="mt-8 border-t border-black/[0.05] pt-8 dark:border-white/[0.05]">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/40">Drafts</h3>
                      <p className="mt-1.5 text-[13px] text-slate-500 dark:text-white/40">Only visible to you</p>
                    </div>
                    <Link
                      href="/author/books"
                      className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] px-4 py-1.5 text-[12px] font-medium text-slate-500 transition-all hover:border-black/[0.12] hover:text-slate-900 dark:border-white/[0.06] dark:text-white/50 dark:hover:border-white/[0.12] dark:hover:text-white"
                    >
                      Manage drafts
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  </div>
                  <div className="flex gap-6 overflow-x-auto pb-4">
                    {draftLibraryCards.map((book) => (
                      <BookCoverCard key={book.id} book={book} size="md" showTag />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Continue Reading */}
        <section className="mb-20 rounded-[24px] border border-black/[0.05] bg-white/50 p-8 backdrop-blur-sm dark:border-white/[0.05] dark:bg-white/[0.015]">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#6C5CE7]">Continue reading</p>
              <h3 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Jump back in</h3>
            </div>
          </div>
          <div className="flex gap-5 overflow-x-auto pb-2">
            {continueReadingCards.length > 0 ? (
              continueReadingCards.map((book) => (
                <BookCoverCard key={book.id} book={book} size="md" />
              ))
            ) : (
              <EmptyStateCard>
                Add books to your library to see them here.
              </EmptyStateCard>
            )}
          </div>
        </section>

        {/* Explore More */}
        <section className="mb-20">
          <div className="mb-10 flex items-center gap-4">
            <h2 className="text-[clamp(26px,3vw,36px)] font-bold tracking-[-0.03em] text-slate-900 dark:text-white">Explore more</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-black/[0.06] to-transparent dark:from-white/[0.06]" />
          </div>

          <div className="mb-12">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#818CF8]">Trending now</p>
                <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/45">What readers are enjoying right now</p>
              </div>
              <div className="flex gap-2">
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white/80 text-slate-400 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-slate-900 hover:shadow-md dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white/80 text-slate-400 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-slate-900 hover:shadow-md dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex gap-5 overflow-x-auto pb-2">
              {trendingCards.length > 0 ? (
                trendingCards.map((book) => <BookCoverCard key={book.id} book={book} size="lg" />)
              ) : (
                <EmptyStateCard>No trending books yet.</EmptyStateCard>
              )}
            </div>
          </div>

          <div className="mb-12 rounded-[24px] border border-black/[0.05] bg-white/50 p-8 backdrop-blur-sm dark:border-white/[0.05] dark:bg-white/[0.015]">
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#A78BFA]">Authors on the rise</p>
                <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/45">Creators gaining momentum</p>
            </div>
            <div className="flex gap-8 overflow-x-auto pb-2">
              {featuredauthors.length > 0 ? (
                featuredauthors.map((author) => (
                  <div key={author.id} className="group flex flex-shrink-0 cursor-pointer flex-col items-center gap-3">
                    <div className="relative">
                      <div className="h-[80px] w-[80px] overflow-hidden rounded-full ring-2 ring-black/[0.06] ring-offset-2 ring-offset-background transition-all duration-300 group-hover:ring-[#907AFF]/40 dark:ring-white/[0.08]">
                        {author.avatar ? (
                          <Image
                            src={author.avatar}
                            alt={author.name}
                            fill
                            unoptimized
                            sizes="80px"
                            className="object-cover transition-transform duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[14px] font-bold text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
                            {author.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#907AFF] ring-2 ring-background">
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-[13px] font-medium text-slate-600 transition-colors group-hover:text-slate-900 dark:text-white/60 dark:group-hover:text-white">
                      {author.name.split(" ")[0]}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyStateCard>No public authors yet.</EmptyStateCard>
              )}
            </div>
          </div>

          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7C3AED]">Discover new reads</p>
                <p className="mt-1.5 text-[14px] text-slate-500 dark:text-white/45">Fresh stories picked for you</p>
              </div>
              <div className="flex gap-2">
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white/80 text-slate-400 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-slate-900 hover:shadow-md dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white/80 text-slate-400 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-slate-900 hover:shadow-md dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex gap-5 overflow-x-auto pb-2">
              {discoverCards.length > 0 ? (
                discoverCards.map((book) => (
                  <BookCoverCard key={book.id} book={book} size="lg" showTag />
                ))
              ) : (
                <EmptyStateCard>No books to discover yet.</EmptyStateCard>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Footer rendered globally in layout */}

      <style jsx>{`@keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } .animate-scroll { animation: scroll 30s linear infinite; }`}</style>

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
