import Link from "next/link";

import BookCard from "@/components/reader/BookCard";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";
import Rail from "@/components/reader/Rail";

const continueReading = [
  {
    id: "midnight-atlas",
    title: "Midnight Atlas",
    author: "Lina Ko",
    cover:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80",
    progress: 62,
    length: "12h",
  },
  {
    id: "glass-tide",
    title: "The Glass Tide",
    author: "Marcus Vail",
    cover:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&auto=format&fit=crop&q=80",
    progress: 34,
    length: "9h",
  },
  {
    id: "northbound",
    title: "Northbound Letters",
    author: "Ari Sun",
    cover:
      "https://images.unsplash.com/photo-1473862170183-6f0baff9e0b1?w=600&auto=format&fit=crop&q=80",
    progress: 78,
    length: "6h",
  },
  {
    id: "garden-of-echoes",
    title: "Garden of Echoes",
    author: "June Park",
    cover:
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600&auto=format&fit=crop&q=80",
    progress: 18,
    length: "11h",
  },
];

const recommended = [
  {
    id: "signal-in-the-snow",
    title: "Signal in the Snow",
    author: "Eva Thorne",
    cover:
      "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&auto=format&fit=crop&q=80",
    rating: 4.6,
    length: "8h",
  },
  {
    id: "soft-edges",
    title: "Soft Edges",
    author: "Will Hart",
    cover:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80",
    rating: 4.8,
    length: "5h",
  },
  {
    id: "city-of-threads",
    title: "City of Threads",
    author: "Noah Mei",
    cover:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&auto=format&fit=crop&q=80",
    rating: 4.4,
    length: "10h",
  },
  {
    id: "bloom-after-dark",
    title: "Bloom After Dark",
    author: "Rina Fox",
    cover:
      "https://images.unsplash.com/photo-1526318896980-cf78c088247c?w=600&auto=format&fit=crop&q=80",
    rating: 4.7,
    length: "7h",
  },
  {
    id: "harborlight",
    title: "Harborlight",
    author: "Miles Vega",
    cover:
      "https://images.unsplash.com/photo-1455885666381-2d876b8e6dcf?w=600&auto=format&fit=crop&q=80",
    rating: 4.5,
    length: "9h",
  },
  {
    id: "sunroom",
    title: "The Sunroom",
    author: "Ivy Lane",
    cover:
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=600&auto=format&fit=crop&q=80",
    rating: 4.3,
    length: "6h",
  },
];

const trending = [
  {
    id: "silent-south",
    title: "Silent South",
    author: "Emil Frost",
    cover:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop&q=80",
    tag: "Trending",
    rating: 4.9,
    length: "13h",
  },
  {
    id: "electric-fern",
    title: "Electric Fern",
    author: "Cleo Mar",
    cover:
      "https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?w=600&auto=format&fit=crop&q=80",
    tag: "New",
    rating: 4.7,
    length: "9h",
  },
  {
    id: "lakehouse",
    title: "The Lakehouse Index",
    author: "Harper Holt",
    cover:
      "https://images.unsplash.com/photo-1529148482759-b35b25c5f217?w=600&auto=format&fit=crop&q=80",
    tag: "Mystery",
    rating: 4.6,
    length: "11h",
  },
  {
    id: "opal-line",
    title: "Opal Line",
    author: "Drew Park",
    cover:
      "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&auto=format&fit=crop&q=80",
    tag: "Audio",
    rating: 4.5,
    length: "7h",
  },
];

export default function ReaderHomePage() {
  return (
    <div className="section-gap-lg">
      <PageHeader
        eyebrow="Reader"
        title="Welcome back"
        subtitle="Pick up where you left off, then explore what your community is reading next."
        actions={
          <Link href="/reader/discover" className="btn-secondary">
            Browse discover
          </Link>
        }
      />

      <Rail
        title="Continue reading"
        subtitle="Your open chapters, ready when you are"
        isEmpty={continueReading.length === 0}
        emptyState={
          <EmptyState
            title="Your shelf is quiet"
            description="Start a book and it will appear here with progress tracking."
            action={
              <Link href="/reader/discover" className="btn-primary rounded-full bg-slate-900 px-5 py-2.5 text-[14px] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/95">
                Explore stories
              </Link>
            }
          />
        }
      >
        {continueReading.length > 0
          ? continueReading.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                cover={book.cover}
                progress={book.progress}
                length={book.length}
                size="lg"
              />
            ))
          : Array.from({ length: 4 }).map((_, index) => <BookCard key={index} isSkeleton size="lg" />)}
      </Rail>

      <Rail
        title="Recommended for you"
        subtitle="Fresh reads aligned with your taste"
        action={
          <Link href="/reader/discover" className="btn-ghost text-[13px] py-1.5">
            See all
          </Link>
        }
        isEmpty={recommended.length === 0}
      >
        {recommended.length > 0
          ? recommended.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                cover={book.cover}
                rating={book.rating}
                length={book.length}
              />
            ))
          : Array.from({ length: 6 }).map((_, index) => <BookCard key={index} isSkeleton />)}
      </Rail>

      <Rail
        title="Trending this week"
        subtitle="What readers are finishing right now"
        isEmpty={trending.length === 0}
      >
        {trending.length > 0
          ? trending.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                cover={book.cover}
                rating={book.rating}
                length={book.length}
                tag={book.tag}
              />
            ))
          : Array.from({ length: 4 }).map((_, index) => <BookCard key={index} isSkeleton />)}
      </Rail>
    </div>
  );
}
