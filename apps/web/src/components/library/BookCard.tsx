"use client";

import type { Book } from "@/lib/supabase/types";

interface BookCardProps {
  book: Book;
  size?: "sm" | "md" | "lg";
  showProgress?: boolean;
  progress?: number;
  onClick?: () => void;
  onAction?: (action: "move" | "rename" | "delete") => void;
  showStats?: boolean;
  stats?: {
    views?: number;
    rating?: number;
    bookmarks?: number;
  };
}

export default function BookCard({ 
  book, 
  size = "md", 
  showProgress = false, 
  progress = 0,
  onClick,
  onAction,
  showStats = false,
  stats
}: BookCardProps) {
  const sizeClasses = {
    sm: "h-[200px] w-[140px]",
    md: "h-[280px] w-[200px]",
    lg: "h-[360px] w-[260px]",
  };

  const formatNumber = (num?: number) => {
    if (!num) return "0";
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="group relative" onClick={onClick}>
      <div
        className={`${sizeClasses[size]} relative cursor-pointer overflow-hidden rounded-2xl border border-black/5 dark:border-white/5 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-all duration-500 group-hover:scale-[1.02]`}
      >
        {/* Cover Image */}
        <div className="absolute inset-0">
          {book.cover_image ? (
            <img 
              src={book.cover_image} 
              alt={book.title} 
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/30 via-[#E29ED5]/30 to-[#FCC997]/30">
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">📚</span>
                <span className="text-xs font-medium text-white/80">No cover</span>
              </div>
            </div>
          )}
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 dark:opacity-90" />

        {/* Stats overlay (top right) */}
        {showStats && (
          <div className="absolute right-3 top-3 flex flex-col gap-2 opacity-0 transition-all duration-300 group-hover:opacity-100">
            {stats?.views !== undefined && (
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur-md">
                <svg className="h-3.5 w-3.5 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="text-[11px] font-medium text-white">{formatNumber(stats.views)}</span>
              </div>
            )}
            {stats?.rating !== undefined && (
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur-md">
                <svg className="h-3.5 w-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-[11px] font-medium text-white">{stats.rating.toFixed(1)}</span>
              </div>
            )}
            {stats?.bookmarks !== undefined && (
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur-md">
                <svg className="h-3.5 w-3.5 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span className="text-[11px] font-medium text-white">{formatNumber(stats.bookmarks)}</span>
              </div>
            )}
          </div>
        )}

        {/* Quick view icon (top left) */}
        <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 backdrop-blur-md opacity-0 transition-all duration-300 group-hover:opacity-100">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Book Info (bottom) */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="mb-1 line-clamp-2 text-[16px] font-semibold leading-tight text-white drop-shadow-lg">
            {book.title}
          </h3>
          {book.description && (
            <p className="mb-2 line-clamp-1 text-[12px] text-white/80">
              {book.description}
            </p>
          )}
          
          {/* Progress bar */}
          {showProgress && progress > 0 && (
            <div className="mb-2">
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/70">
                <span>{progress}% complete</span>
                <span>{100 - progress}% left</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/40 backdrop-blur-sm">
                <div
                  className="h-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions menu */}
        {onAction && (
          <div className="absolute right-3 bottom-3 opacity-0 transition-all duration-300 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Open actions menu
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/90 backdrop-blur-md transition-all hover:bg-black/70"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
