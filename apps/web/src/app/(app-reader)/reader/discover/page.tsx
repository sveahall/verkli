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
    <div className="section-gap-lg">
      <PageHeader
        eyebrow="Discover"
        title="Find your next obsession"
        subtitle="Browse by mood, follow new voices, and jump into curated collections."
        actions={
          <Link href="/reader/community" className="btn-secondary">
            See community picks
          </Link>
        }
      />

      <section className="space-y-5">
        <h2 className="text-section-title">Browse genres</h2>
        <div className="flex flex-wrap gap-2.5">
          {genres.map((genre) => (
            <button
              key={genre}
              type="button"
              className="btn-ghost rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] dark:border-white/10 dark:bg-white/5"
            >
              {genre}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {featuredBanners.map((banner, index) => (
          <div
            key={banner.id}
            className={`card-base relative overflow-hidden p-6 sm:p-8 ${
              index === 0 ? "bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-white/[0.06] dark:via-white/[0.04] dark:to-white/[0.02]" : "bg-gradient-to-br from-amber-50/80 via-white to-white dark:from-amber-950/20 dark:via-white/[0.04] dark:to-white/[0.02]"
            }`}
          >
            <div className="relative z-10 space-y-4">
              <span className="text-eyebrow text-[11px]">Featured collection</span>
              <h3 className="text-section-title">{banner.title}</h3>
              <p className="text-body text-[14px]">{banner.description}</p>
              <Link href="/reader/discover" className="btn-primary inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-[14px] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/95">
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
          <Link href="/reader/discover" className="btn-ghost text-[13px] py-1.5">
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

      <section className="space-y-5">
        <h2 className="text-section-title">Top authors</h2>
        <div className="grid gap-6 md:grid-cols-2">
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
