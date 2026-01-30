"use client";

import { useState } from "react";
import Link from "next/link";

import BookCard from "@/components/reader/BookCard";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";
import Tabs, { type TabItem } from "@/components/reader/Tabs";

const tabs: TabItem[] = [
  { id: "reading", label: "Currently reading", badge: "4" },
  { id: "saved", label: "Saved", badge: "2" },
  { id: "finished", label: "Finished", badge: "6" },
];

type LibraryBook = {
  id: string;
  title: string;
  author: string;
  cover: string;
  progress?: number;
};

const reading: LibraryBook[] = [
  {
    id: "midnight-atlas",
    title: "Midnight Atlas",
    author: "Lina Ko",
    cover:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80",
    progress: 62,
  },
  {
    id: "glass-tide",
    title: "The Glass Tide",
    author: "Marcus Vail",
    cover:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&auto=format&fit=crop&q=80",
    progress: 34,
  },
  {
    id: "northbound",
    title: "Northbound Letters",
    author: "Ari Sun",
    cover:
      "https://images.unsplash.com/photo-1473862170183-6f0baff9e0b1?w=600&auto=format&fit=crop&q=80",
    progress: 78,
  },
  {
    id: "garden-of-echoes",
    title: "Garden of Echoes",
    author: "June Park",
    cover:
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600&auto=format&fit=crop&q=80",
    progress: 18,
  },
];

const saved: LibraryBook[] = [
  {
    id: "opal-line",
    title: "Opal Line",
    author: "Drew Park",
    cover:
      "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "river-bound",
    title: "Riverbound",
    author: "Elena Grey",
    cover:
      "https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?w=600&auto=format&fit=crop&q=80",
  },
];

const finished: LibraryBook[] = [
  {
    id: "sunroom",
    title: "The Sunroom",
    author: "Ivy Lane",
    cover:
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "soft-edges",
    title: "Soft Edges",
    author: "Will Hart",
    cover:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "signal-in-the-snow",
    title: "Signal in the Snow",
    author: "Eva Thorne",
    cover:
      "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "harborlight",
    title: "Harborlight",
    author: "Miles Vega",
    cover:
      "https://images.unsplash.com/photo-1455885666381-2d876b8e6dcf?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "quiet-noon",
    title: "Quiet Noon",
    author: "Owen Price",
    cover:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "sea-glass",
    title: "Sea Glass Letters",
    author: "Nora Lark",
    cover:
      "https://images.unsplash.com/photo-1473862170183-6f0baff9e0b1?w=600&auto=format&fit=crop&q=80",
  },
];

const collections: Record<string, LibraryBook[]> = {
  reading,
  saved,
  finished,
};

export default function ReaderLibraryPage() {
  const [activeTab, setActiveTab] = useState("reading");
  const activeBooks = collections[activeTab] ?? [];

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Library"
        title="Your library"
        subtitle="Everything you have started, saved, or finished lives here."
        actions={
          <Link href="/reader/discover" className="btn-secondary">
            Add new books
          </Link>
        }
      />

      <Tabs items={tabs} active={activeTab} onChange={setActiveTab} />

      {activeBooks.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Save a story to keep it close. Your picks will show up in this tab."
          action={
            <Link href="/reader/discover" className="btn-primary rounded-full bg-slate-900 px-5 py-2.5 text-[14px] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/95">
              Browse discovery
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
          {activeBooks.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              cover={book.cover}
              progress={book.progress}
              size="lg"
              layout="grid"
            />
          ))}
        </div>
      )}
    </div>
  );
}
