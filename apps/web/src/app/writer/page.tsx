"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GlassSurface from "@/components/GlassSurface";
import GridMotion from "@/components/GridMotion";
import TestimonialSection from "@/components/TestimonialSection";
import StatsSection from "@/components/StatsSection";
import FeaturesSection from "@/components/FeaturesSection";
import ShelfTile from "@/components/library/ShelfTile";
import BookCard from "@/components/library/BookCard";
import { getShelves, createShelf, getStandaloneBooks } from "@/lib/supabase/shelves-client";
import type { ShelfWithDetails } from "@/lib/supabase/shelves-client";
import type { Book } from "@/lib/supabase/types";
import type { User } from "@supabase/supabase-js";

const gridImages = [
  "https://images.unsplash.com/photo-1723403804231-f4e9b515fe9d?q=80&w=3870&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1748370987492-eb390a61dcda?q=80&w=3464&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];

const gridRows = 6;
const gridCols = 10;
const gridItems = Array.from({ length: gridRows * gridCols }, (_, index) => {
  return gridImages[index % gridImages.length];
});

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0.12,
  blur: 12,
  saturation: 1.2,
  mixBlendMode: "screen",
};

type EmptyStateCardProps = {
  children: ReactNode;
};

function EmptyStateCard({ children }: EmptyStateCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-4 text-[14px] text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/55">
      {children}
    </div>
  );
}

type FeaturedWriter = {
  id: string;
  name: string;
  avatar?: string | null;
};

const ctaBooks = [
  "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1629992101753-56d196c8aabb?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1589998059171-988d887df646?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=200&h=280&fit=crop",
];

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
      href={`/writer/books/${book.id}`}
      className="group relative flex-shrink-0 transition-transform duration-300 hover:-translate-y-1.5"
    >
      <div
        className={`relative overflow-hidden ${styles.container} bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-all duration-500 group-hover:scale-[1.02]`}
      >
        {book.cover ? (
          <img src={book.cover} alt={book.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
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
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm">
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
                <div className="h-2 overflow-hidden rounded-full bg-black/50 backdrop-blur-sm">
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
// INTERACTIVE TESTIMONIAL SECTION
// ============================================
function InteractiveTestimonialSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePos({ x, y });
  };

  return (
    <section className="relative mx-auto w-full max-w-[1200px] px-6 py-20">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[700px] rounded-full bg-gradient-to-r from-[#907AFF]/5 via-[#E29ED5]/3 to-transparent blur-[120px]" />
      </div>
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => { setMousePos({ x: 0.5, y: 0.5 }); setIsHovering(false); }}
        className="relative overflow-hidden rounded-[40px] border border-black/10 bg-gradient-to-br from-black/[0.04] via-black/[0.02] to-transparent p-10 md:p-14 dark:border-white/[0.08] dark:from-white/[0.04] dark:via-white/[0.02]"
      >
        <div className="pointer-events-none absolute h-[500px] w-[500px] rounded-full blur-[150px] transition-all duration-700 ease-out" style={{ background: "#907AFF", opacity: isHovering ? 0.15 : 0.08, left: `${mousePos.x * 100 - 25}%`, top: `${mousePos.y * 100 - 25}%` }} />
        <div className="pointer-events-none absolute h-[400px] w-[400px] rounded-full blur-[120px] transition-all duration-1000 ease-out" style={{ background: "#E29ED5", opacity: isHovering ? 0.12 : 0.06, left: `${(1 - mousePos.x) * 100 - 20}%`, top: `${(1 - mousePos.y) * 100 - 20}%` }} />
        <div className="pointer-events-none absolute h-[300px] w-[300px] rounded-full blur-[100px] transition-all duration-500 ease-out" style={{ background: "#FCC997", opacity: isHovering ? 0.1 : 0.04, left: `${mousePos.x * 80 + 10}%`, top: `${mousePos.y * 60 + 20}%` }} />
        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#907AFF]/20 bg-[#907AFF]/5 px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#907AFF]">Social proof</span>
            </div>
            <h2 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-slate-900 dark:text-white md:text-[52px]">
              Authors love<br /><span className="bg-gradient-to-r from-slate-900/40 to-slate-700/20 bg-clip-text text-transparent dark:from-white/40 dark:to-white/20">what we do.</span>
            </h2>
            <p className="mt-6 max-w-[380px] text-[16px] leading-[1.7] text-slate-600 dark:text-white/50">Join thousands of writers who use Verkli to turn their stories into content that reaches readers everywhere.</p>
            <div className="mt-8 flex items-center gap-4">
              <Link href="/writer/signup">
                <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button border border-[#907AFF]/30 transition-all hover:scale-[1.02] hover:border-[#907AFF]/50">
                  <span className="px-7 py-3 text-[14px] font-medium text-slate-900 dark:text-white">Start for free</span>
                </GlassSurface>
              </Link>
              <a href="#" className="text-[14px] text-slate-500 underline underline-offset-4 transition-colors hover:text-slate-700 dark:text-white/50 dark:hover:text-white/70">Read case studies</a>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl bg-black/[0.04] p-8 backdrop-blur-sm dark:bg-white/[0.04]">
              <p className="text-[20px] font-normal leading-[1.5] tracking-[-0.01em] text-slate-900/90 dark:text-white/90">&quot;Fable helped me turn one story into content that reached millions. The success has been incredible.&quot;</p>
              <div className="mt-6 flex items-center gap-4">
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face" alt="Ariana Godoy" className="h-11 w-11 rounded-full object-cover" />
                <div><div className="text-[15px] font-medium text-slate-900 dark:text-white">Ariana Godoy</div><div className="text-[13px] text-slate-500 dark:text-white/50">Bestselling author</div></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-black/[0.04] p-5 backdrop-blur-sm dark:bg-white/[0.04]">
                <p className="text-[14px] leading-relaxed text-slate-700 dark:text-white/80">&quot;My launch stayed visible for weeks.&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop&crop=face" alt="Sarah Chen" className="h-8 w-8 rounded-full object-cover" />
                  <div className="text-[13px] text-slate-500 dark:text-white/50">Sarah Chen</div>
                </div>
              </div>
              <div className="rounded-2xl bg-black/[0.04] p-5 backdrop-blur-sm dark:bg-white/[0.04]">
                <p className="text-[14px] leading-relaxed text-slate-700 dark:text-white/80">&quot;BookTok finally clicked for me.&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=60&h=60&fit=crop&crop=face" alt="Mark Torres" className="h-8 w-8 rounded-full object-cover" />
                  <div className="text-[13px] text-slate-500 dark:text-white/50">Mark Torres</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-black/[0.04] px-6 py-5 backdrop-blur-sm dark:bg-white/[0.04]">
              <div className="text-center"><div className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">12,000+</div><div className="mt-0.5 text-[11px] text-slate-500 dark:text-white/40">authors</div></div>
              <div className="h-8 w-px bg-black/10 dark:bg-white/10" />
              <div className="text-center"><div className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">4.9/5</div><div className="mt-0.5 text-[11px] text-slate-500 dark:text-white/40">rating</div></div>
              <div className="h-8 w-px bg-black/10 dark:bg-white/10" />
              <div className="text-center"><div className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">89%</div><div className="mt-0.5 text-[11px] text-slate-500 dark:text-white/40">time saved</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================
// LANDING PAGE (for non-authenticated users)
// ============================================
function LandingPage() {
  const [heroMousePos, setHeroMousePos] = useState({ x: 0.5, y: 0.5 });
  const heroRef = useRef<HTMLElement>(null);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setHeroMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  return (
    <main className="writer-light relative min-h-screen bg-background text-foreground transition-colors duration-300 -mt-[88px]">
      <div className="section-stack">
        {/* Hero */}
        <section ref={heroRef} onMouseMove={handleHeroMouseMove} className="relative isolate mx-auto flex min-h-screen w-full max-w-[1800px] flex-col items-center justify-center overflow-hidden px-6 pb-50 pt-[88px] text-center">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="relative h-full w-full">
              <div className="absolute inset-0 z-0"><GridMotion items={gridItems} gradientColor="black" rows={gridRows} cols={gridCols} /></div>
              <div className="absolute inset-0 z-10 bg-white/75 dark:bg-black/70" />
              <div className="absolute inset-0 z-11 bg-gradient-to-b from-white via-transparent to-white dark:from-[#050508] dark:to-[#050508]" />
              <div className="absolute z-12 h-[600px] w-[600px] rounded-full blur-[180px] transition-all duration-1000 ease-out" style={{ background: "#907AFF", opacity: 0.15, left: `${heroMousePos.x * 100 - 30}%`, top: `${heroMousePos.y * 100 - 30}%` }} />
              <div className="absolute z-12 h-[400px] w-[400px] rounded-full blur-[150px] transition-all duration-[1500ms] ease-out" style={{ background: "#E29ED5", opacity: 0.1, left: `${(1 - heroMousePos.x) * 100 - 20}%`, top: `${heroMousePos.y * 100 - 20}%` }} />
              <div className="absolute z-12 h-[300px] w-[300px] rounded-full blur-[120px] transition-all duration-700 ease-out" style={{ background: "#FCC997", opacity: 0.08, left: `${heroMousePos.x * 70 + 15}%`, top: `${(1 - heroMousePos.y) * 60 + 20}%` }} />
            </div>
          </div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/5 px-4 py-2 backdrop-blur-sm transition-transform duration-300 hover:scale-105 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#907AFF]" />
            <span className="text-[13px] text-slate-600 dark:text-white/60">Now in public beta</span>
          </div>
          <h1 className="text-[52px] font-semibold leading-[1.05] tracking-[-0.03em] text-slate-900 dark:text-white md:text-[80px]">Write once.<br /><span className="bg-gradient-to-r from-slate-400/90 via-slate-400/75 to-slate-400/50 bg-clip-text text-transparent dark:from-white/50 dark:via-white/30 dark:to-white/50">Show up everywhere.</span></h1>
          <p className="mt-8 max-w-[520px] text-[17px] leading-relaxed text-slate-600 dark:text-white/50 md:text-[18px]">The platform for authors to turn books into content, connect with readers, and build sustainable revenue.</p>
          <div className="mt-10 flex items-center gap-4">
            <Link href="/writer/signup">
              <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button border border-[#907AFF]/30 transition-all hover:scale-[1.02] hover:border-[#907AFF]/50">
                <span className="px-8 py-2.5 text-[15px] font-medium text-slate-900 dark:text-white">Get started free</span>
              </GlassSurface>
            </Link>
            <a href="#features" className="group flex items-center gap-2 text-[15px] text-slate-500 transition-colors hover:text-slate-700 dark:text-white/50 dark:hover:text-white/70">See how it works<svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></a>
          </div>
        </section>

        {/* Bento Grid */}
        <section className="relative mx-auto w-full max-w-[1200px] px-6 py-16">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="group relative col-span-full overflow-hidden rounded-[32px] bg-gradient-to-br from-[#907AFF]/20 via-[#E29ED5]/10 to-[#FCC997]/10 p-10 lg:col-span-2 lg:p-12">
              <div className="pointer-events-none absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-[#907AFF]/20 blur-[100px] transition-transform duration-1000 group-hover:translate-x-10" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full bg-[#E29ED5]/15 blur-[80px]" />
              <div className="relative max-w-[500px]">
                <h2 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-slate-900 dark:text-white md:text-[48px]">Zero friction<br /><span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">book marketing.</span></h2>
                <p className="mt-6 max-w-[420px] text-[17px] leading-[1.7] text-slate-600 dark:text-white/60">An end-to-end platform that turns your book into structured content — easy to publish, adapt, and scale.</p>
                <div className="mt-8">
                  <Link href="/writer/signup">
                    <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button inline-flex border border-black/10 transition-all hover:scale-[1.02] dark:border-white/20">
                      <span className="px-7 py-3 text-[15px] font-medium text-slate-900 dark:text-white">Start for free</span>
                    </GlassSurface>
                  </Link>
                </div>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-[32px] bg-gradient-to-br from-black/[0.05] to-transparent p-8 dark:from-white/[0.06] dark:to-white/[0.02]">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FCC997]/20 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative flex h-full flex-col justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-1">{[1,2,3,4,5].map((i) => (<svg key={i} className="h-4 w-4 text-[#FCC997]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>))}</div>
                  <p className="text-[40px] font-semibold text-slate-900 dark:text-white">4.9/5</p>
                  <p className="mt-1 text-[14px] text-slate-600 dark:text-white/50">Average rating from authors</p>
                </div>
                <div className="mt-6 flex -space-x-2">
                  {["https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face"].map((src, i) => (<img key={i} src={src} alt="" className="h-9 w-9 rounded-full border-2 border-black/10 object-cover transition-transform duration-300 hover:z-10 hover:scale-110 dark:border-[#0a0a0f]" />))}
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-black/10 bg-black/5 text-[11px] font-medium text-slate-600 dark:border-[#0a0a0f] dark:bg-white/10 dark:text-white/70">+2k</div>
                </div>
              </div>
            </div>
            {[{ title: "No credit card", desc: "Start free, upgrade anytime", color: "#907AFF" },{ title: "2 min setup", desc: "Go live in minutes", color: "#E29ED5" },{ title: "10+ platforms", desc: "Publish everywhere", color: "#FCC997" }].map((item) => (
              <div key={item.title} className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-black/[0.05] to-transparent p-6 transition-all duration-500 hover:from-black/[0.08] dark:from-white/[0.05] dark:hover:from-white/[0.08]">
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50" style={{ background: item.color }} />
                <div className="relative"><div className="mb-3 h-2 w-2 rounded-full" style={{ background: item.color }} /><p className="text-[17px] font-medium text-slate-900 dark:text-white">{item.title}</p><p className="mt-1 text-[14px] text-slate-600 dark:text-white/50">{item.desc}</p></div>
              </div>
            ))}
          </div>
        </section>

        <TestimonialSection />
        <StatsSection />
        <FeaturesSection />
        <InteractiveTestimonialSection />

        {/* Why Verkli */}
        <section className="mx-auto w-full max-w-[1200px] px-6 py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-wider text-[#E29ED5]">Why Verkli</p>
              <h2 className="mt-4 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-slate-900 dark:text-white md:text-[44px]">Everything you need to<br /><span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">grow your audience.</span></h2>
              <p className="mt-6 max-w-[400px] text-[16px] leading-[1.7] text-slate-600 dark:text-white/50">Simple tools that help you reach readers without the complexity.</p>
              <div className="mt-8">
                <Link href="/writer/signup">
                  <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button inline-flex border border-black/10 transition-all hover:scale-[1.02] dark:border-white/15">
                    <span className="px-7 py-3 text-[15px] font-medium text-slate-900 dark:text-white">Explore features</span>
                  </GlassSurface>
                </Link>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[{ title: "Get discovered", description: "Turn your book into scroll-stopping content for TikTok and beyond.", color: "#907AFF" },{ title: "Grow your audience", description: "Reach readers before they buy. Build momentum with content.", color: "#E29ED5" },{ title: "Automate marketing", description: "AI-generated hooks, scripts, and captions. Without daily effort.", color: "#FCC997" },{ title: "Focus on writing", description: "Upload a chapter, get content. No complex tools needed.", color: "#FEE9A3" }].map((item) => (
                <div key={item.title} className="group relative overflow-hidden rounded-[24px] border border-black/10 bg-gradient-to-br from-black/[0.04] to-transparent p-6 transition-all duration-500 hover:border-black/20 hover:from-black/[0.06] dark:border-white/[0.06] dark:from-white/[0.04] dark:hover:border-white/[0.12] dark:hover:from-white/[0.06]">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50" style={{ background: item.color }} />
                  <div className="relative">
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-500 group-hover:scale-110" style={{ background: `linear-gradient(135deg, ${item.color}25, ${item.color}10)` }}><div className="h-2 w-2 rounded-full" style={{ background: item.color }} /></div>
                    <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                    <p className="mt-2 text-[14px] leading-[1.6] text-slate-600 dark:text-white/50">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative mx-auto w-full max-w-[1200px] px-6 py-24">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="group relative overflow-hidden rounded-[40px] bg-gradient-to-br from-[#907AFF]/30 via-[#E29ED5]/20 to-[#FCC997]/15 p-10 md:p-14">
              <div className="pointer-events-none absolute -left-20 -top-20 h-[350px] w-[350px] rounded-full bg-[#907AFF]/40 blur-[100px] transition-transform duration-1000 group-hover:translate-x-10 group-hover:translate-y-10" />
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-[250px] w-[250px] rounded-full bg-[#E29ED5]/30 blur-[80px] transition-transform duration-1000 group-hover:-translate-x-5" />
              <div className="relative">
                <p className="text-[13px] font-medium uppercase tracking-wider text-slate-600 dark:text-white/60">Get started today</p>
                <h2 className="mt-4 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-slate-900 dark:text-white md:text-[44px]">Ready to reach<br /><span className="bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 bg-clip-text text-transparent dark:from-white dark:via-white/80 dark:to-white/60">more readers?</span></h2>
                <p className="mt-6 max-w-[380px] text-[16px] leading-[1.7] text-slate-600 dark:text-white/60">Join thousands of authors already turning their books into content that reaches readers everywhere.</p>
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <Link href="/writer/signup">
                    <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button border border-black/10 transition-all hover:scale-[1.02] dark:border-white/25">
                      <span className="px-8 py-3.5 text-[15px] font-semibold text-slate-900 dark:text-white">Start for free</span>
                    </GlassSurface>
                  </Link>
                  <a href="#" className="flex items-center gap-2 text-[15px] text-slate-600 transition-colors hover:text-slate-900 dark:text-white/60 dark:hover:text-white">Schedule a demo<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></a>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <div className="group relative flex-1 overflow-hidden rounded-[32px] bg-gradient-to-br from-black/[0.05] to-transparent p-8 dark:from-white/[0.06] dark:to-white/[0.02]">
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#907AFF]/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex items-center gap-1">{[1,2,3,4,5].map((i) => (<svg key={i} className="h-5 w-5 text-[#FCC997]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>))}</div>
                  <p className="mt-3 text-[28px] font-semibold text-slate-900 dark:text-white">4.9 out of 5</p>
                  <p className="mt-1 text-[14px] text-slate-600 dark:text-white/50">Based on 2,000+ author reviews</p>
                </div>
              </div>
              <div className="group relative flex-1 overflow-hidden rounded-[32px] bg-gradient-to-br from-black/[0.05] to-transparent p-8 dark:from-white/[0.06] dark:to-white/[0.02]">
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#E29ED5]/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex -space-x-3">{["https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face"].map((src, i) => (<img key={i} src={src} alt="" className="h-11 w-11 rounded-full border-2 border-black/10 object-cover transition-transform duration-300 hover:z-10 hover:scale-110 dark:border-[#0a0a0f]" />))}<div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-black/10 bg-gradient-to-br from-[#907AFF]/30 to-[#E29ED5]/30 text-[12px] font-semibold text-slate-900 dark:border-[#0a0a0f] dark:text-white">+2k</div></div>
                  <p className="mt-4 text-[15px] leading-[1.6] text-slate-700 dark:text-white/70">&quot;Verkli helped me turn one story into content that reached millions.&quot;</p>
                  <p className="mt-2 text-[13px] text-slate-500 dark:text-white/40">— Emma Richardson, NYT Bestseller</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative mx-auto w-full max-w-[1200px] px-6 pb-12 pt-8">
          <div className="grid gap-12 rounded-[32px] bg-gradient-to-b from-black/[0.04] to-transparent p-10 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:p-12 dark:from-white/[0.04]">
            <div className="space-y-5">
              <img src="/logo-dark.svg" alt="Verkli" className="h-9 w-auto dark:hidden" />
              <img src="/favicon.svg" alt="Verkli" className="hidden h-9 w-auto dark:block" />
              <p className="max-w-[280px] text-[15px] leading-[1.7] text-slate-600 dark:text-white/50">Where books become momentum. The platform for authors who want to reach readers everywhere.</p>
              <div className="flex gap-3 pt-2">
                <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-slate-500 transition-all hover:bg-black/10 hover:text-slate-700 dark:bg-white/[0.05] dark:text-white/50 dark:hover:bg-white/[0.1] dark:hover:text-white/80"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg></a>
                <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-slate-500 transition-all hover:bg-black/10 hover:text-slate-700 dark:bg-white/[0.05] dark:text-white/50 dark:hover:bg-white/[0.1] dark:hover:text-white/80"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>
                <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-slate-500 transition-all hover:bg-black/10 hover:text-slate-700 dark:bg-white/[0.05] dark:text-white/50 dark:hover:bg-white/[0.1] dark:hover:text-white/80"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg></a>
              </div>
            </div>
            <div className="space-y-4"><p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Product</p><ul className="space-y-3 text-[15px] text-slate-600 dark:text-white/50"><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Features</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Pricing</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Examples</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Integrations</a></li></ul></div>
            <div className="space-y-4"><p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Company</p><ul className="space-y-3 text-[15px] text-slate-600 dark:text-white/50"><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">About</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Blog</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Careers</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Contact</a></li></ul></div>
            <div className="space-y-4"><p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Legal</p><ul className="space-y-3 text-[15px] text-slate-600 dark:text-white/50"><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Privacy</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Terms</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white/80">Cookie Policy</a></li></ul></div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-4 px-4 text-[13px] text-slate-500 dark:text-white/30 md:flex-row">
            <span>© 2026 Verkli. All rights reserved.</span>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-400"></span><span>All systems operational</span></div>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ============================================
// DASHBOARD (for authenticated users)
// ============================================
function Dashboard({ user }: { user: User }) {
  const router = useRouter();
  const createDropdownRef = useRef<HTMLDivElement>(null);
  const [shelves, setShelves] = useState<ShelfWithDetails[]>([]);
  const [standaloneBooks, setStandaloneBooks] = useState<Book[]>([]);
  const [loadingShelves, setLoadingShelves] = useState(true);
  const [featuredWriters, setFeaturedWriters] = useState<FeaturedWriter[]>([]);
  
  // Modal states
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showShelfModal, setShowShelfModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
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
  
  // Book form state
  const [bookForm, setBookForm] = useState({
    title: "",
    cover: "",
    summary: "",
    authorsNote: "",
    tags: [] as string[],
    content: "",
    uploadFile: null as File | null,
    creationMethod: "write" as "write" | "upload",
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
    const loadWriters = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .eq("role", "writer")
        .eq("is_public", true)
        .limit(8);

      if (!error && data) {
        setFeaturedWriters(
          data.map((writer) => ({
            id: writer.user_id,
            name: writer.display_name || "Writer",
            avatar: writer.avatar_url,
          }))
        );
      }
    };

    loadWriters();
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
    } catch (error: any) {
      console.warn("Error loading shelves (non-critical):", error);
      // Set empty arrays on error to prevent UI crashes
      setShelves([]);
      setStandaloneBooks([]);
    } finally {
      setLoadingShelves(false);
    }
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Writer";

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

  const continueReadingCards = libraryCards.slice(0, 6);
  const trendingCards = libraryCards.slice(0, 8);
  const discoverCards = libraryCards.slice(8, 16);
  
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
    setBookForm({ title: "", cover: "", summary: "", authorsNote: "", tags: [], content: "", uploadFile: null, creationMethod: "write" });
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
  
  const handleBookSubmit = async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");
      
      // Create standalone book
      const slug = (bookForm.title || "Untitled").toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
      const { data: book, error: bookError } = await supabase
        .from('books')
        .insert({
          title: bookForm.title || "Untitled",
          slug: slug,
          cover_image: bookForm.cover || null,
          description: bookForm.summary || null,
          author_id: authUser.id,
          status: 'DRAFT',
          published: false,
        })
        .select()
        .single();
      
      if (bookError) throw bookError;
      
      // If selectedShelfId, add to shelf
      if (selectedShelfId) {
        const { error: shelfBookError } = await supabase
          .from('shelf_books')
          .insert({
            shelf_id: selectedShelfId,
            book_id: book.id,
            section_id: null,
            sort_index: 0,
          });
        
        if (shelfBookError) throw shelfBookError;
      }
      
      setShowBookModal(false);
      setBookForm({ title: "", cover: "", summary: "", authorsNote: "", tags: [], content: "", uploadFile: null, creationMethod: "write" });
      setSelectedShelfId(null);
      
      // Reload shelves
      await loadShelves();
    } catch (error) {
      // Avoid Next.js console overlay – log as warning instead
      console.warn("Non-critical: error creating book", error);
    }
  };
  
  const handleTagInput = (value: string, type: "shelf" | "book") => {
    const tags = value.split(",").map(t => t.trim()).filter(t => t);
    if (type === "shelf") {
      setShelfForm({ ...shelfForm, tags });
    } else {
      setBookForm({ ...bookForm, tags });
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background/90 text-foreground transition-colors duration-300">

      <div className="mx-auto max-w-[1400px] px-6 pt-24 pb-16">
        <section className="mb-14 text-center">
          <h1 className="mt-4 text-[45px] font-semibold tracking-[-0.04em] text-slate-900 dark:text-white">
            {displayName}
            <span className="ml-2 bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">
              ’s world
            </span>
          </h1>
          <p className="mt-3 max-w-xl text-[15px] text-slate-600 dark:text-white/55 mx-auto">
            Curate shelves, experiment with new books, and keep everything you&apos;re writing in one calm workspace.
          </p>
        </section>

        {/* My Library */}
        <section className="mb-20">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[20px] font-semibold text-slate-900 dark:text-white">My library</h2>
            <div className="relative" ref={createDropdownRef}>
              <button 
                onClick={() => setShowCreateDropdown(!showCreateDropdown)} 
                className="rounded-full border border-black/10 dark:border-white/10 px-5 py-2 text-[13px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.06]"
              >
                Create
                <svg className="ml-2 inline h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showCreateDropdown && (
                <div className="absolute right-0 top-full mt-2 w-[200px] overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-2 backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setShowCreateDropdown(false);
                      handleCreateShelf();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] text-slate-700 dark:text-white/70 transition-colors hover:bg-black/5 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
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
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] text-slate-700 dark:text-white/70 transition-colors hover:bg-black/5 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#E29ED5]/20 to-[#FCC997]/20">
                      <svg className="h-4 w-4 text-[#E29ED5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium">Add stand alone book</div>
                      <div className="text-[12px] text-slate-500 dark:text-white/50">Create a book</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {shelves.length === 0 ? (
            // Empty state with two large actions
            <div className="rounded-3xl border border-black/10 dark:border-white/[0.08] from-black/5 dark:from-white/[0.04] to-transparent p-12">
              <div className="grid gap-6 md:grid-cols-2">
                <button
                  onClick={handleCreateShelf}
                  className="group flex h-[300px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200/20 dark:border-white/10 bg-black/1 dark:bg-white/[0.02] transition-all hover:border-[#907AFF]/15 hover:bg-black/5 dark:hover:bg-white/[0.04]"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                    <svg className="h-8 w-8 text-[#907AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-[20px] font-semibold text-slate-900 dark:text-white">New shelf</h3>
                  <p className="max-w-[200px] text-center text-[14px] text-slate-600 dark:text-white/50">
                    Organize your books into collections
                  </p>
                </button>
                
                <button
                  onClick={handleCreateBook}
                  className="group flex h-[300px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200/20 dark:border-white/10 bg-black/1 dark:bg-white/[0.02] transition-all hover:border-[#907AFF]/15 hover:bg-black/5 dark:hover:bg-white/[0.04]"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-[#E29ED5]/20 to-[#FCC997]/20">
                    <svg className="h-8 w-8 text-[#E29ED5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-[20px] font-semibold text-slate-900 dark:text-white">Add stand alone book</h3>
                  <p className="max-w-[200px] text-center text-[14px] text-slate-600 dark:text-white/50">
                    Create a book that doesn&apos;t belong to a shelf
                  </p>
                </button>
              </div>
            </div>
          ) : (
            // Shelves grid
            <div className="rounded-3xl border border-black/10 dark:border-white/[0.08] bg-gradient-to-b from-black/5 dark:from-white/[0.04] to-transparent p-8">
              {loadingShelves ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#907AFF]"></div>
                </div>
              ) : (
                <div className="mb-6">
                  <h3 className="mb-4 text-[16px] font-semibold text-slate-900 dark:text-white">Shelves</h3>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {shelves.map((shelf) => (
                      <ShelfTile
                        key={shelf.id}
                        shelf={shelf}
                        bookCount={shelf.shelf_books?.length || 0}
                        onClick={() => router.push(`/writer/library/${shelf.id}`)}
                      />
                    ))}
                    <button
                      onClick={handleCreateShelf}
                      className="flex h-[280px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-black/20 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
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
                <div className="mt-8 border-t border-black/10 dark:border-white/[0.06] pt-8">
                  <h3 className="mb-6 text-[20px] font-semibold text-slate-900 dark:text-white">Standalone books</h3>
                  <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {standaloneBooks.map((book) => (
                      <BookCard
                        key={book.id}
                        book={book}
                        size="sm"
                        onClick={() => router.push(`/writer/books/${book.id}`)}
                        showStats={false}
                      />
                    ))}
                    <button
                      onClick={handleCreateBook}
                      className="flex h-[180px] w-[120px] items-center justify-center rounded-xl border-2 border-dashed border-black/20 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
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
            </div>
          )}
        </section>

        {/* Continue Reading */}
        <section className="mb-20">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#907AFF]">CONTINUE READING</p>
            <p className="mt-1 text-[14px] text-slate-600 dark:text-white/50">Jump back in</p>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4">
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
          <h2 className="mb-10 text-[32px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">Explore more</h2>

          <div className="mb-12">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#E29ED5]">TRENDING NOW</p>
                <p className="mt-1 text-[14px] text-slate-600 dark:text-white/50">What readers are enjoying right now</p>
              </div>
              <div className="flex gap-2">
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 text-slate-500 dark:text-white/50 transition-all hover:border-black/20 dark:hover:border-white/20 hover:bg-black/5 dark:hover:bg-white/[0.03] hover:text-slate-900 dark:hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 text-slate-500 dark:text-white/50 transition-all hover:border-black/20 dark:hover:border-white/20 hover:bg-black/5 dark:hover:bg-white/[0.03] hover:text-slate-900 dark:hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex gap-6 overflow-x-auto pb-4">
              {trendingCards.length > 0 ? (
                trendingCards.map((book) => <BookCoverCard key={book.id} book={book} size="lg" />)
              ) : (
                <EmptyStateCard>No trending books yet.</EmptyStateCard>
              )}
            </div>
          </div>

          <div className="mb-12">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#FCC997]">WRITERS ON THE RISE</p>
                <p className="mt-1 text-[14px] text-slate-600 dark:text-white/50">Creators gaining momentum</p>
            </div>
            <div className="flex gap-6 overflow-x-auto pb-4">
              {featuredWriters.length > 0 ? (
                featuredWriters.map((writer) => (
                  <div key={writer.id} className="group flex flex-shrink-0 cursor-pointer flex-col items-center">
                    <div className="relative">
                      <div className="h-[72px] w-[72px] overflow-hidden rounded-full border-2 border-black/10 dark:border-white/10 transition-all duration-300 group-hover:border-[#907AFF]/50">
                        {writer.avatar ? (
                          <img src={writer.avatar} alt={writer.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20 text-[12px] font-semibold text-slate-700 dark:text-white/70">
                            {writer.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#907AFF] to-[#E29ED5]">
                        <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                    <p className="mt-3 text-[13px] font-medium text-slate-700 dark:text-white/70 transition-colors group-hover:text-slate-900 dark:group-hover:text-white">
                      {writer.name.split(" ")[0]}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyStateCard>No public writers yet.</EmptyStateCard>
              )}
            </div>
          </div>

          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#FEE9A3]">DISCOVER NEW READS</p>
                <p className="mt-1 text-[14px] text-slate-600 dark:text-white/50">What readers are enjoying right now</p>
              </div>
              <div className="flex gap-2">
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 text-slate-500 dark:text-white/50 transition-all hover:border-black/20 dark:hover:border-white/20 hover:bg-black/5 dark:hover:bg-white/[0.03] hover:text-slate-900 dark:hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 text-slate-500 dark:text-white/50 transition-all hover:border-black/20 dark:hover:border-white/20 hover:bg-black/5 dark:hover:bg-white/[0.03] hover:text-slate-900 dark:hover:text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex gap-6 overflow-x-auto pb-4">
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

      <footer className="border-t border-black/10 dark:border-white/[0.06] bg-background">
        <div className="mx-auto max-w-[1400px] px-6 py-16">
          <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
            <div>
              <img src="/logo-dark.svg" alt="Verkli" className="h-9 w-auto dark:hidden" />
              <img src="/favicon.svg" alt="Verkli" className="hidden h-9 w-auto dark:block" />
              <p className="mt-5 max-w-[220px] text-[14px] leading-relaxed text-slate-600 dark:text-white/50">Where books become momentum.</p>
            </div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">VERKLI</p><ul className="mt-5 space-y-3 text-[14px] text-slate-600 dark:text-white/50"><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">Light reader app</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">Go Premium</a></li></ul></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">DISCOVER</p><ul className="mt-5 space-y-3 text-[14px] text-slate-600 dark:text-white/50"><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">Social</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">Library</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">Clubs</a></li></ul></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">APP</p><ul className="mt-5 space-y-3 text-[14px] text-slate-600 dark:text-white/50"><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">iOS</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">Android</a></li></ul></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">ABOUT</p><ul className="mt-5 space-y-3 text-[14px] text-slate-600 dark:text-white/50"><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">About us</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">Careers</a></li><li><a href="#" className="transition-colors hover:text-slate-900 dark:hover:text-white">Contact</a></li></ul></div>
          </div>
          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-black/10 dark:border-white/[0.06] pt-8 text-[13px] text-slate-500 dark:text-white/30 md:flex-row"><div className="flex gap-6"><a href="#" className="transition-colors hover:text-slate-700 dark:hover:text-white/50">Terms of Service</a><a href="#" className="transition-colors hover:text-slate-700 dark:hover:text-white/50">Privacy Policy</a></div><span>© 2026 Verkli. All rights reserved.</span></div>
        </div>
      </footer>

      <style jsx>{`@keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } .animate-scroll { animation: scroll 30s linear infinite; }`}</style>

      {/* Choice Modal - Shelf or Book */}
      {showChoiceModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowChoiceModal(false)}>
          <div className="relative w-full max-w-[600px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-8 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowChoiceModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="mb-6 text-[28px] font-semibold text-slate-900 dark:text-white">Create new</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <button onClick={handleCreateShelf} className="group rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                  <svg className="h-6 w-6 text-[#907AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </div>
                <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">Create Shelf</h3>
                <p className="text-[14px] text-slate-600 dark:text-white/50">Organize your books into collections (e.g., book series)</p>
              </button>
              <button onClick={handleCreateBook} className="group rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#E29ED5]/20 to-[#FCC997]/20">
                  <svg className="h-6 w-6 text-[#E29ED5]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">Create Book</h3>
                <p className="text-[14px] text-slate-600 dark:text-white/50">Write a new book or upload an existing one</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shelf Creation Modal */}
      {showShelfModal && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto pt-20">
          <div className="relative my-8 w-full max-w-[800px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-10 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowShelfModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
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
                  className="flex-1 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[20px] font-semibold text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                />
                <svg className="h-5 w-5 text-slate-400 dark:text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </div>
              <input
                type="text"
                value={shelfForm.subtitle}
                onChange={(e) => setShelfForm({ ...shelfForm, subtitle: e.target.value })}
                placeholder="Optional subtitle"
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
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
                          : "bg-black/5 dark:bg-white/[0.02] text-slate-600 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      Image
                    </button>
                    <button
                      onClick={() => setShelfForm({ ...shelfForm, coverType: "gradient" })}
                      className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-all ${
                        shelfForm.coverType === "gradient"
                          ? "bg-[#907AFF] text-white"
                          : "bg-black/5 dark:bg-white/[0.02] text-slate-600 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                </div>
                
                {shelfForm.coverType === "image" ? (
                  <>
                    <button className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]">
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
                        <img src={shelfForm.cover} alt="Shelf cover" className="h-full w-full object-cover" />
                        <button onClick={() => setShelfForm({ ...shelfForm, cover: "" })} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:bg-black/80">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        "linear-gradient(135deg, #907AFF 0%, #E29ED5 100%)",
                        "linear-gradient(135deg, #E29ED5 0%, #FCC997 100%)",
                        "linear-gradient(135deg, #FCC997 0%, #FEE9A3 100%)",
                        "linear-gradient(135deg, #907AFF 0%, #FCC997 100%)",
                      ].map((gradient, i) => (
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
                    className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                    />
                  </div>
                )}
              </div>

              {/* Typography Settings */}
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] p-5">
                <h4 className="mb-5 text-[15px] font-semibold text-slate-900 dark:text-white">Typography Settings</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Font Family</label>
                    <select
                      value={shelfForm.typography.fontFamily}
                      onChange={(e) => setShelfForm({ ...shelfForm, typography: { ...shelfForm.typography, fontFamily: e.target.value } })}
                      className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
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
                      className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
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
                        className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Subtitle Size</label>
                      <input
                        type="text"
                        value={shelfForm.typography.subtitleSize}
                        onChange={(e) => setShelfForm({ ...shelfForm, typography: { ...shelfForm.typography, subtitleSize: e.target.value } })}
                        placeholder="14px"
                        className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
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
                        className="flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <button 
                  onClick={() => setShelfForm({ ...shelfForm, description: shelfForm.description ? "" : " " })}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add summary</span>
                </button>
                {shelfForm.description && (
                  <textarea
                    value={shelfForm.description}
                    onChange={(e) => setShelfForm({ ...shelfForm, description: e.target.value })}
                    placeholder="Describe your shelf..."
                    className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                    rows={4}
                    autoFocus
                  />
                )}
              </div>

              {/* Author's Note */}
              <div>
                <button 
                  onClick={() => setShelfForm({ ...shelfForm, authorsNote: shelfForm.authorsNote ? "" : " " })}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add author&apos;s note</span>
                </button>
                {shelfForm.authorsNote && (
                  <textarea
                    value={shelfForm.authorsNote}
                    onChange={(e) => setShelfForm({ ...shelfForm, authorsNote: e.target.value })}
                    placeholder="Add a personal note about this shelf..."
                    className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
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
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add general tags</span>
                </button>
                {shelfForm.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {shelfForm.tags.map((tag, i) => (
                      <span key={i} className="flex items-center gap-2 rounded-full bg-[#907AFF]/20 px-3 py-1 text-[13px] text-[#907AFF]">
                        {tag}
                        <button onClick={() => setShelfForm({ ...shelfForm, tags: shelfForm.tags.filter((_, idx) => idx !== i) })} className="text-[#907AFF]/60 hover:text-[#907AFF]">
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
                  className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                />
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-3 border-t border-black/10 dark:border-white/10 pt-6">
              <button onClick={() => setShowShelfModal(false)} className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-6 py-3 text-[14px] font-semibold text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.04]">
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
          <div className="relative my-8 w-full max-w-[700px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-8 backdrop-blur-xl">
            <button onClick={() => setShowReviewShelfModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="mb-6 text-[28px] font-semibold text-slate-900 dark:text-white">Review shelf</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-[16px] font-medium text-slate-900 dark:text-white">{shelfForm.name || "New shelf"}</h3>
                {shelfForm.cover && (
                  <div className="mb-4 h-48 w-32 overflow-hidden rounded-lg">
                    <img src={shelfForm.cover} alt="Shelf cover" className="h-full w-full object-cover" />
                  </div>
                )}
                {shelfForm.description && (
                  <p className="mb-4 text-[14px] text-slate-700 dark:text-white/70">{shelfForm.description}</p>
                )}
                {shelfForm.authorsNote && (
                  <div className="mb-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] p-4">
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
              <button onClick={() => { setShowReviewShelfModal(false); setShowShelfModal(true); }} className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-6 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.04]">
                Edit
              </button>
              <button onClick={handleReviewShelfConfirm} className="rounded-xl bg-[#907AFF] px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#8069EE]">
                Create shelf
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Creation Modal */}
      {showBookModal && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto pt-20">
          <div className="relative my-8 w-full max-w-[900px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-10 backdrop-blur-xl">
            <button onClick={() => setShowBookModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="mb-8 text-[24px] font-semibold text-slate-900 dark:text-white">Create new book</h2>
            <div className="mb-8 flex items-center gap-3">
              <input
                type="text"
                value={bookForm.title}
                onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                placeholder="New section"
                className="flex-1 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[20px] font-semibold text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
              />
              <svg className="h-5 w-5 text-slate-400 dark:text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </div>

            <div className="space-y-6">
              {/* Cover Upload */}
              <button className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]">
                <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add book cover</span>
                <input type="file" accept="image/*" className="hidden" id="book-cover" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => setBookForm({ ...bookForm, cover: e.target?.result as string });
                    reader.readAsDataURL(file);
                  }
                }} />
                <label htmlFor="book-cover" className="cursor-pointer rounded-lg bg-[#907AFF]/10 px-3 py-1.5 text-[13px] font-medium text-[#907AFF] transition-colors hover:bg-[#907AFF]/20">Upload</label>
              </button>
              {bookForm.cover && (
                <div className="relative h-48 w-32 overflow-hidden rounded-lg">
                  <img src={bookForm.cover} alt="Book cover" className="h-full w-full object-cover" />
                  <button onClick={() => setBookForm({ ...bookForm, cover: "" })} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:bg-black/80">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}

              {/* Summary */}
              <div>
                <button 
                  onClick={() => setBookForm({ ...bookForm, summary: bookForm.summary ? "" : " " })}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add summary</span>
                </button>
                {bookForm.summary && (
                  <textarea
                    value={bookForm.summary}
                    onChange={(e) => setBookForm({ ...bookForm, summary: e.target.value })}
                    placeholder="Write a summary of your book..."
                    className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                    rows={4}
                    autoFocus
                  />
                )}
              </div>

              {/* Author's Note */}
              <div>
                <button 
                  onClick={() => setBookForm({ ...bookForm, authorsNote: bookForm.authorsNote ? "" : " " })}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add author&apos;s note</span>
                </button>
                {bookForm.authorsNote && (
                  <textarea
                    value={bookForm.authorsNote}
                    onChange={(e) => setBookForm({ ...bookForm, authorsNote: e.target.value })}
                    placeholder="Add a personal note about this book..."
                    className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                    rows={3}
                    autoFocus
                  />
                )}
              </div>

              {/* Tags */}
              <div>
                <button 
                  onClick={() => {
                    const input = document.getElementById("book-tags-input") as HTMLInputElement;
                    if (input) input.focus();
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                >
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">+ Add general tags</span>
                </button>
                {bookForm.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {bookForm.tags.map((tag, i) => (
                      <span key={i} className="flex items-center gap-2 rounded-full bg-[#907AFF]/20 px-3 py-1 text-[13px] text-[#907AFF]">
                        {tag}
                        <button onClick={() => setBookForm({ ...bookForm, tags: bookForm.tags.filter((_, idx) => idx !== i) })} className="text-[#907AFF]/60 hover:text-[#907AFF]">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  id="book-tags-input"
                  type="text"
                  placeholder="Enter tags separated by commas, then press Enter..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const value = (e.target as HTMLInputElement).value;
                      if (value.trim()) {
                        handleTagInput(value, "book");
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                />
              </div>

              {/* Creation Method Choice */}
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] p-6">
                <h3 className="mb-5 text-[16px] font-semibold text-slate-900 dark:text-white">How do you want to create your book?</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    onClick={() => setBookForm({ ...bookForm, creationMethod: "write" })}
                    className={`rounded-xl border p-5 text-left transition-all ${
                      bookForm.creationMethod === "write"
                        ? "border-[#907AFF]/50 bg-[#907AFF]/10 ring-2 ring-[#907AFF]/30"
                        : "border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="mb-2 text-[16px] font-semibold text-slate-900 dark:text-white">Create book in section</div>
                    <div className="text-[13px] text-slate-600 dark:text-white/50">Write your book directly in our editor</div>
                  </button>
                  <button
                    onClick={() => setBookForm({ ...bookForm, creationMethod: "upload" })}
                    className={`rounded-xl border p-5 text-left transition-all ${
                      bookForm.creationMethod === "upload"
                        ? "border-[#907AFF]/50 bg-[#907AFF]/10 ring-2 ring-[#907AFF]/30"
                        : "border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="mb-2 text-[16px] font-semibold text-slate-900 dark:text-white">Upload book to section</div>
                    <div className="text-[13px] text-slate-600 dark:text-white/50">Upload your book if it&apos;s already complete</div>
                  </button>
                </div>

                {/* Editor or Upload based on choice */}
                {bookForm.creationMethod === "write" && (
                  <div className="mt-5">
                    <textarea
                      value={bookForm.content}
                      onChange={(e) => setBookForm({ ...bookForm, content: e.target.value })}
                      placeholder="Start writing your book here..."
                      className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06] focus:ring-2 focus:ring-[#907AFF]/20"
                      rows={12}
                    />
                  </div>
                )}

                {bookForm.creationMethod === "upload" && (
                  <div className="mt-4">
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/[0.02] p-8 transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]">
                      <svg className="mb-3 h-12 w-12 text-slate-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="mb-1 text-[14px] font-medium text-slate-700 dark:text-white/70">Click to upload or drag and drop</span>
                      <span className="text-[12px] text-slate-500 dark:text-white/50">PDF, DOCX, TXT (MAX. 10MB)</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setBookForm({ ...bookForm, uploadFile: file });
                        }}
                      />
                    </label>
                    {bookForm.uploadFile && (
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-3">
                        <span className="text-[14px] text-slate-700 dark:text-white/70">{bookForm.uploadFile.name}</span>
                        <button onClick={() => setBookForm({ ...bookForm, uploadFile: null })} className="text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-3 border-t border-black/10 dark:border-white/10 pt-6">
              <button onClick={() => setShowBookModal(false)} className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] px-6 py-3 text-[14px] font-semibold text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.04]">
                Cancel
              </button>
              <button onClick={handleBookSubmit} className="rounded-xl bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-6 py-3 text-[14px] font-semibold text-white transition-all hover:from-[#8069EE] hover:to-[#7058DD]">
                {bookForm.creationMethod === "write" ? "Create book" : "Upload book"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function WriterPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const getUser = async () => { const { data: { user } } = await supabase.auth.getUser(); setUser(user); setLoading(false); };
    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT") setUser(null); else if (event === "SIGNED_IN" && session?.user) setUser(session.user); });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#050508]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-black/20 border-t-[#907AFF] dark:border-white/20"></div></div>;

  return user ? <Dashboard user={user} /> : <LandingPage />;
}
