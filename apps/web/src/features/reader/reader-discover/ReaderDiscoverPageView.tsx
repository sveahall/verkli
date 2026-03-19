import Image from "next/image";
import Link from "next/link";
import { BookMarked, BookOpen, Compass, Search, Sparkles, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import BookCard from "@/components/reader/BookCard";
import AuthorCard from "@/components/reader/AuthorCard";

type DiscoverBook = { id: string; title: string; author: string; cover: string | null; href: string; tag?: string };
type DiscoverAuthor = { id: string; name: string; avatar: string | null; genre?: string; href: string };
type DiscoverList = { id: string; slug: string; title: string; description: string | null; items: DiscoverBook[] };
type GenreFilter = { id: string; slug: string; label: string; icon: string | null };
type LanguageOption = { value: string; label: string; href: string; active: boolean };

type ReaderDiscoverPageViewProps = {
  languageLabel: string;
  languageOptions: LanguageOption[];
  heroBook: DiscoverBook | null;
  trendingBooks: DiscoverBook[];
  newBooks: DiscoverBook[];
  popularBooks: DiscoverBook[];
  curatedLists: DiscoverList[];
  authors: DiscoverAuthor[];
  genres: GenreFilter[];
};

function ShelfCard({ eyebrow, title, books }: { eyebrow: string; title: string; books: DiscoverBook[] }) {
  if (books.length === 0) return null;
  return (
    <Card>
      <CardContent>
        <p className="text-eyebrow text-[#907AFF]">{eyebrow}</p>
        <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">{title}</h3>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {books.map((b) => <BookCard key={b.id} id={b.id} title={b.title} author={b.author} cover={b.cover} href={b.href} tag={b.tag} layout="grid" size="lg" />)}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReaderDiscoverPageView({
  languageLabel, languageOptions, heroBook, trendingBooks, newBooks, popularBooks, curatedLists, authors, genres,
}: ReaderDiscoverPageViewProps) {
  const hasBooks = trendingBooks.length > 0 || newBooks.length > 0 || popularBooks.length > 0;
  const popularGenres = genres.slice(0, 8);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Discover"
        title="Find your next read"
        description={`Browse new releases, momentum picks, and public authors in ${languageLabel}.`}
        actions={
          <div className="flex gap-2">
            {languageOptions.map((o) => (
              <Link key={o.value} href={o.href} className={o.active ? "inline-flex min-h-[36px] items-center rounded-full bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white dark:bg-white dark:text-slate-900" : "inline-flex min-h-[36px] items-center rounded-full border border-slate-200/80 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:text-white"}>
                {o.label}
              </Link>
            ))}
          </div>
        }
      />

      {/* ── Hero ── */}
      <Card className="relative overflow-hidden border-[#907AFF]/[0.08] bg-gradient-to-br from-[#907AFF]/[0.04] via-white to-[#E29ED5]/[0.03] dark:from-[#907AFF]/[0.1] dark:via-[#0f1117] dark:to-[#E29ED5]/[0.05]">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[400px] w-[400px] rounded-full bg-[#907AFF]/[0.06] blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-[250px] w-[250px] rounded-full bg-[#E29ED5]/[0.05] blur-[80px]" />
        <CardContent>
          <div className="relative grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
            <div className="space-y-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#907AFF]/10 px-3 py-1 text-[12px] font-semibold text-[#907AFF] dark:bg-[#907AFF]/20">
                <Sparkles className="h-3 w-3" />
                {heroBook ? "Spotlight" : `Browsing ${languageLabel}`}
              </span>
              <div className="space-y-2">
                <h2 className="text-[32px] font-bold leading-[1.1] tracking-tight text-slate-950 dark:text-white sm:text-[42px]">
                  {heroBook ? heroBook.title : "Stories worth your time"}
                </h2>
                <p className="max-w-lg text-[15px] leading-relaxed text-slate-500 dark:text-white/50">
                  {heroBook ? `By ${heroBook.author}. Trending books, new releases, and authors publishing now.` : "Browse public authors, curated lists, and discover books published on Verkli."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {heroBook ? <Link href={heroBook.href} className="btn-primary inline-flex items-center gap-2 text-[13px]"><BookOpen className="h-4 w-4" /> Open book</Link> : null}
                {hasBooks ? <a href="#discover-shelves" className="btn-secondary inline-flex items-center gap-2 text-[13px]"><Compass className="h-4 w-4" /> Browse shelves</a> : null}
                {authors.length > 0 ? <a href="#discover-authors" className="btn-secondary inline-flex items-center gap-2 text-[13px]"><Users className="h-4 w-4" /> Authors</a> : null}
              </div>
              <div className="flex min-h-[48px] max-w-lg items-center gap-3 rounded-full border border-slate-200/80 bg-white/80 px-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] dark:border-white/10 dark:bg-white/[0.05]">
                <Search className="h-4 w-4 text-slate-400 dark:text-white/40" />
                <span className="flex-1 text-[14px] text-slate-400 dark:text-white/40">Search by title, author, or mood</span>
              </div>
              {popularGenres.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {popularGenres.map((g) => (
                    <Link key={g.id} href={`/reader/genres?genre=${g.slug}`} className="inline-flex items-center rounded-full border border-slate-200/60 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-[#907AFF]/30 hover:text-[#907AFF] dark:border-white/[0.08] dark:text-white/55 dark:hover:text-[#b8a8ff]">
                      {g.icon ? `${g.icon} ` : ""}{g.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="hidden lg:block">
              <div className="relative mx-auto h-[360px] w-[280px]">
                <div className="absolute inset-8 rounded-[24px] bg-[#907AFF]/20 blur-3xl" />
                <div className="absolute left-1/2 top-4 z-10 w-[200px] -translate-x-1/2">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-white/50 shadow-[0_20px_60px_-16px_rgba(144,122,255,0.4)] dark:border-white/10">
                    {heroBook?.cover ? (
                      <Image src={heroBook.cover} alt={heroBook.title} fill sizes="200px" className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/15 to-[#E29ED5]/10"><BookMarked className="h-12 w-12 text-[#907AFF]/30" /></div>
                    )}
                  </div>
                  {heroBook ? (
                    <div className="mt-2 text-center">
                      <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{heroBook.title}</p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-white/50">{heroBook.author}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Shelves ── */}
      {hasBooks ? (
        <div id="discover-shelves" className="grid gap-6 lg:grid-cols-2">
          <ShelfCard eyebrow="Trending now" title="What readers are opening" books={trendingBooks} />
          <ShelfCard eyebrow="Popular this week" title="Momentum picks" books={popularBooks} />
          <ShelfCard eyebrow="New releases" title="Fresh to the catalog" books={newBooks} />
        </div>
      ) : null}

      {/* ── Curated lists ── */}
      {curatedLists.map((list) => (
        <Card key={list.id}>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-eyebrow text-[#907AFF]">Curated list</p>
                <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">{list.title}</h3>
              </div>
              <Link href={`/reader/lists/${list.slug}`} className="btn-ghost text-[13px]">Open list</Link>
            </div>
            <div className="mt-4 -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
              {list.items.map((b) => <div key={b.id} className="snap-start"><BookCard id={b.id} title={b.title} author={b.author} cover={b.cover} href={b.href} size="lg" /></div>)}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* ── Authors + Genres ── */}
      <div id="discover-authors" className="grid gap-6 lg:grid-cols-2">
        {genres.length > 0 ? (
          <Card>
            <CardContent>
              <p className="text-eyebrow text-[#907AFF]">Genres</p>
              <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">Browse by mood</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {genres.map((g) => (
                  <Link key={g.id} href={`/reader/genres?genre=${g.slug}`} className="rounded-full border border-slate-200/60 bg-slate-50 px-3.5 py-2 text-[13px] font-medium text-slate-700 transition hover:border-[#907AFF]/30 hover:bg-[#907AFF]/5 hover:text-[#907AFF] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/65 dark:hover:text-[#b8a8ff]">
                    {g.icon ? `${g.icon} ` : ""}{g.label}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
        {authors.length > 0 ? (
          <Card>
            <CardContent>
              <p className="text-eyebrow text-[#907AFF]">Authors</p>
              <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">Writers publishing now</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {authors.map((a) => <AuthorCard key={a.id} name={a.name} avatar={a.avatar} genre={a.genre} href={a.href} />)}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {!hasBooks && authors.length === 0 && genres.length === 0 && curatedLists.length === 0 ? (
        <Card variant="subtle" className="py-6 text-center">
          <p className="text-[15px] text-slate-500 dark:text-white/50">The catalog for {languageLabel} is growing. Check back soon or try another language.</p>
        </Card>
      ) : null}
    </div>
  );
}
