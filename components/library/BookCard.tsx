"use client";

import type { Book } from "@/lib/supabase/types";

interface BookCardProps {
  book: Book;
  size?: "sm" | "md" | "lg";
  showProgress?: boolean;
  progress?: number;
  onClick?: () => void;
  onAction?: (action: "move" | "rename" | "delete") => void;
}

export default function BookCard({ 
  book, 
  size = "md", 
  showProgress = false, 
  progress = 0,
  onClick,
  onAction 
}: BookCardProps) {
  const sizeClasses = {
    sm: "h-[160px] w-[110px]",
    md: "h-[180px] w-[120px]",
    lg: "h-[200px] w-[140px]",
  };

  return (
    <div className="group relative">
      <div
        className={`${sizeClasses[size]} cursor-pointer overflow-hidden rounded-xl bg-black/5 dark:bg-white/[0.05] shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-[#907AFF]/10`}
        onClick={onClick}
      >
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
            <span className="text-2xl">📚</span>
          </div>
        )}
        {showProgress && progress > 0 && (
          <div className="absolute bottom-3 left-3 right-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-black/60 backdrop-blur-sm">
              <div
                className="h-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Actions menu on hover */}
      {onAction && (
        <div className="absolute right-3 top-3 opacity-0 transition-all duration-300 group-hover:opacity-100">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
