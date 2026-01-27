import Link from "next/link";
import { notFound } from "next/navigation";
import GlassSurface from "@/components/GlassSurface";

const books = [
  {
    id: 1,
    title: "Dune",
    author: "Frank Herbert",
    cover: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=600&h=900&fit=crop",
    reads: 2500,
    chapters: 6,
    rating: 4.2,
    currentChapter: 4,
    currentPage: 33,
    totalPages: 120,
    progress: 45,
    description:
      "A desert planet, a prophecy, and the most valuable resource in the universe. Dune is a sweeping saga of power, survival, and destiny.",
  },
  {
    id: 2,
    title: "Work of Imagination",
    author: "Sarah Chen",
    cover: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&h=900&fit=crop",
    reads: 1900,
    chapters: 6,
    rating: 4.4,
    currentChapter: 6,
    currentPage: 88,
    totalPages: 150,
    progress: 62,
    description:
      "A reflective journey through creativity, identity, and the limits of imagination.",
  },
  {
    id: 3,
    title: "The Story of a Lonely Boy",
    author: "Mark Torres",
    cover: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&h=900&fit=crop",
    reads: 2100,
    chapters: 6,
    rating: 4.3,
    currentChapter: 9,
    currentPage: 118,
    totalPages: 160,
    progress: 72,
    description:
      "A quiet coming-of-age tale about friendship, belonging, and small-town dreams.",
  },
  {
    id: 4,
    title: "Dune Messiah",
    author: "Frank Herbert",
    cover: "https://images.unsplash.com/photo-1629992101753-56d196c8aabb?w=600&h=900&fit=crop",
    reads: 1700,
    chapters: 5,
    rating: 4.1,
    currentChapter: 3,
    currentPage: 61,
    totalPages: 180,
    progress: 34,
    description:
      "The sequel to Dune follows Paul Atreides as he wrestles with myth, power, and fate.",
  },
  {
    id: 5,
    title: "Foundation",
    author: "Isaac Asimov",
    cover: "https://images.unsplash.com/photo-1589998059171-988d887df646?w=600&h=900&fit=crop",
    reads: 2300,
    chapters: 7,
    rating: 4.5,
    currentChapter: 5,
    currentPage: 95,
    totalPages: 210,
    progress: 52,
    description:
      "A visionary classic about science, society, and the future of civilization.",
  },
];

const formatCompactNumber = (value?: number) => {
  if (!value && value !== 0) return "--";
  if (value < 1000) return value.toString();
  const formatted = (value / 1000).toFixed(1);
  return `${formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted}K`;
};

type PageProps = {
  params: { id: string };
};

export default function BookDetailPage({ params }: PageProps) {
  const bookId = Number(params.id);
  const book = books.find((item) => item.id === bookId);

  if (!book) {
    notFound();
  }

  const pagesLeft = Math.max(book.totalPages - book.currentPage, 0);
  const percentLeft = Math.max(100 - book.progress, 0);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-[1200px] px-6 pt-10">
        <Link
          href="/writer"
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to library
        </Link>
      </header>

      <section className="mx-auto grid max-w-[1200px] gap-12 px-6 py-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="relative">
          <div className="relative overflow-hidden rounded-[32px] shadow-2xl shadow-black/40">
            <img
              src={book.cover}
              alt={book.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-white/60">
            <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {formatCompactNumber(book.reads)} readers
            </span>
            <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {book.chapters} chapters
            </span>
            <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {book.rating.toFixed(1)} rating
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-5xl">
            {book.title}
          </h1>
          <p className="mt-2 text-lg text-slate-600 dark:text-white/60">by {book.author}</p>

          <div className="mt-8 flex flex-wrap gap-4">
            <GlassSurface
              width="auto"
              height="auto"
              borderRadius={999}
              className="glass-button border border-[#907AFF]/30"
            >
              <button className="px-6 py-3 text-sm font-semibold text-slate-900 dark:text-white">
                Continue reading
              </button>
            </GlassSurface>
            <button className="rounded-full border border-black/10 bg-black/5 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-black/20 hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10">
              Add to shelf
            </button>
          </div>

          <div className="mt-10 rounded-[24px] border border-black/10 bg-black/5 p-6 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-white/70">
              <span>Chapter {book.currentChapter}</span>
              <span>Page {book.currentPage}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/20 dark:bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5]"
                style={{ width: `${book.progress}%` }}
              />
            </div>
            <div className="mt-3 text-xs text-slate-500 dark:text-white/50">
              {percentLeft}% left • {pagesLeft} pages
            </div>
          </div>

          <div className="mt-10">
            <h2 className="text-xl font-semibold leading-[1.3] text-slate-900 dark:text-white">About the book</h2>
            <p className="mt-3 text-base leading-[1.7] text-slate-600 dark:text-white/60">
              {book.description}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
