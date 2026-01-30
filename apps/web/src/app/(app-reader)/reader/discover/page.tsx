import Link from "next/link";

import AuthorCard from "@/components/reader/AuthorCard";
import BookCard from "@/components/reader/BookCard";
import PageHeader from "@/components/reader/PageHeader";
import Rail from "@/components/reader/Rail";

const genres = [
  "Romance",
  "Fantasy",
  "Mystery",
  "Sci-Fi",
  "Thriller",
  "Cozy",
  "Literary",
  "Historical",
  "Nonfiction",
  "Audio",
  "Essays",
  "Short Reads",
];

const featuredBanners = [
  {
    id: "banner-1",
    title: "Winter Escapes",
    description: "Stories for long, quiet nights."
  },
  {
    id: "banner-2",
    title: "New voices",
    description: "Debut authors with fresh perspectives."
  },
];

const editorialPicks = [
  {
    id: "sea-glass",
    title: "Sea Glass Letters",
    author: "Nora Lark",
    cover:
      "https://images.unsplash.com/photo-1473862170183-6f0baff9e0b1?w=600&auto=format&fit=crop&q=80",
    rating: 4.8,
    length: "7h",
  },
  {
    id: "softstorm",
    title: "Softstorm",
    author: "Mila Voss",
    cover:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&auto=format&fit=crop&q=80",
    rating: 4.6,
    length: "9h",
  },
  {
    id: "quiet-noon",
    title: "Quiet Noon",
    author: "Owen Price",
    cover:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&auto=format&fit=crop&q=80",
    rating: 4.5,
    length: "6h",
  },
  {
    id: "river-bound",
    title: "Riverbound",
    author: "Elena Grey",
    cover:
      "https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?w=600&auto=format&fit=crop&q=80",
    rating: 4.7,
    length: "8h",
  },
];

const topAuthors = [
  { name: "Lina Ko", genre: "Speculative fiction", followers: "92k" },
  { name: "Marcus Vail", genre: "Coastal mystery", followers: "61k" },
  { name: "June Park", genre: "Romantic drama", followers: "48k" },
];

export default function ReaderDiscoverPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Discover"
        title="Find your next obsession"
        subtitle="Browse by mood, follow new voices, and jump into curated collections."
        actions={
          <Link
            href="/reader/community"
            className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
          >
            See community picks
          </Link>
        }
      />

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">Browse genres</h2>
        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => (
            <button
              key={genre}
              type="button"
              className="rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[12px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b12]"
            >
              {genre}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {featuredBanners.map((banner, index) => (
          <div
            key={banner.id}
            className={`relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5 ${
              index === 0 ? "bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-white/10 dark:via-white/5 dark:to-white/10" : "bg-gradient-to-br from-amber-50 via-white to-white dark:from-white/10 dark:via-white/5 dark:to-white/10"
            }`}
          >
            <div className="space-y-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                Featured collection
              </span>
              <h3 className="text-[22px] font-semibold text-slate-900 dark:text-white">{banner.title}</h3>
              <p className="text-[14px] text-slate-600 dark:text-white/65">{banner.description}</p>
              <Link
                href="/reader/discover"
                className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                Explore
              </Link>
            </div>
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-slate-200/60 blur-2xl dark:bg-white/10" />
          </div>
        ))}
      </section>

      <Rail
        title="Editorial picks"
        subtitle="Hand-picked by the Verkli team"
        action={
          <Link
            href="/reader/discover"
            className="text-[12px] font-medium text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white"
          >
            Refresh
          </Link>
        }
      >
        {editorialPicks.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover={book.cover}
            rating={book.rating}
            length={book.length}
          />
        ))}
      </Rail>

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">Top authors</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {topAuthors.map((author) => (
            <AuthorCard
              key={author.name}
              name={author.name}
              genre={author.genre}
              followers={author.followers}
              href="/reader/community"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
