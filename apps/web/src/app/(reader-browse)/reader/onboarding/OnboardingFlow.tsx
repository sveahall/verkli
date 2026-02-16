"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import GenreGrid from "@/components/reader/GenreGrid";
import BookSwipeCard from "@/components/reader/BookSwipeCard";

interface Genre {
  id: string;
  slug: string;
  name_sv: string;
  name_en: string;
  icon: string | null;
  display_order: number;
}

interface SwipeBook {
  id: string;
  title: string;
  author: string;
  cover: string | null;
}

type BookSignal = { bookId: string; signal: "like" | "skip" };

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<"genres" | "books" | "submitting">("genres");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [swipeBooks, setSwipeBooks] = useState<SwipeBook[]>([]);
  const [bookSignals, setBookSignals] = useState<Map<string, "like" | "skip">>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [genresLoaded, setGenresLoaded] = useState(false);

  // Load genres on first render
  const loadGenres = useCallback(async () => {
    if (genresLoaded) return;
    try {
      const res = await fetch("/api/genres");
      if (!res.ok) throw new Error("Failed to load genres");
      const data = await res.json();
      setGenres(data.genres ?? []);
      setGenresLoaded(true);
    } catch {
      setError("Could not load genres. Please try again.");
    }
  }, [genresLoaded]);

  // Trigger genre load
  if (!genresLoaded && genres.length === 0 && !error) {
    loadGenres();
  }

  const toggleGenre = useCallback((genreId: string) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(genreId)) {
        next.delete(genreId);
      } else if (next.size < 10) {
        next.add(genreId);
      }
      return next;
    });
  }, []);

  const handleNextToBooks = useCallback(async () => {
    setError(null);
    // Fetch popular books from selected genres for the swipe step
    try {
      const res = await fetch("/api/recommendations/for-you?limit=10");
      if (res.ok) {
        const data = await res.json();
        setSwipeBooks(
          (data.books ?? []).map((b: { id: string; title: string; author_name: string; cover_image: string | null }) => ({
            id: b.id,
            title: b.title,
            author: b.author_name,
            cover: b.cover_image,
          }))
        );
      }
    } catch {
      // Non-blocking — swipe step is optional
    }
    setStep("books");
  }, []);

  const handleLike = useCallback((bookId: string) => {
    setBookSignals((prev) => {
      const next = new Map(prev);
      next.set(bookId, "like");
      return next;
    });
  }, []);

  const handleSkip = useCallback((bookId: string) => {
    setBookSignals((prev) => {
      const next = new Map(prev);
      next.set(bookId, "skip");
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    setStep("submitting");
    setError(null);

    const signals: BookSignal[] = [];
    bookSignals.forEach((signal, bookId) => {
      signals.push({ bookId, signal });
    });

    try {
      const res = await fetch("/api/reader/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genreIds: [...selectedGenres],
          bookSignals: signals,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Onboarding failed");
      }

      router.push("/reader/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStep("books");
    }
  }, [selectedGenres, bookSignals, router]);

  if (step === "genres") {
    return (
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">
            What do you like to read?
          </h1>
          <p className="text-[15px] text-slate-500 dark:text-white/60">
            Pick at least 3 genres so we can recommend books for you.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        <GenreGrid
          genres={genres}
          selected={selectedGenres}
          onToggle={toggleGenre}
        />

        <div className="flex justify-center">
          <button
            type="button"
            disabled={selectedGenres.size < 3}
            onClick={handleNextToBooks}
            className="rounded-full bg-[#907AFF] px-8 py-3 text-[14px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next ({selectedGenres.size}/3+)
          </button>
        </div>
      </div>
    );
  }

  if (step === "books") {
    return (
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Which books appeal to you?
          </h1>
          <p className="text-[15px] text-slate-500 dark:text-white/60">
            Like or skip to help us understand your taste. You can skip this step too.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        {swipeBooks.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-1">
            {swipeBooks.map((book) => (
              <BookSwipeCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                cover={book.cover}
                onLike={handleLike}
                onSkip={handleSkip}
                signal={bookSignals.get(book.id) ?? null}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500 dark:text-white/50">
            No books to show right now. You can continue directly.
          </p>
        )}

        <div className="flex justify-center gap-4">
          <button
            type="button"
            onClick={() => setStep("genres")}
            className="rounded-full border border-slate-200 bg-white px-6 py-3 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-full bg-[#907AFF] px-8 py-3 text-[14px] font-semibold text-white transition hover:bg-[#8069EE]"
          >
            Finish
          </button>
        </div>
      </div>
    );
  }

  // Submitting state
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#907AFF] border-t-transparent" />
      <p className="text-[14px] text-slate-500 dark:text-white/60">Saving your choices...</p>
    </div>
  );
}
