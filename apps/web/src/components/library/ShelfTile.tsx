"use client";

import Link from "next/link";
import type { Shelf } from "@/lib/supabase/types";

interface ShelfTileProps {
  shelf: Shelf;
  onClick?: () => void;
  bookCount?: number;
}

export default function ShelfTile({ shelf, onClick, bookCount }: ShelfTileProps) {
  const coverStyle = shelf.cover_type === 'gradient' && shelf.cover_gradient
    ? { background: shelf.cover_gradient }
    : shelf.cover_url
    ? { backgroundImage: `url(${shelf.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(135deg, #907AFF 0%, #E29ED5 100%)' };

  const typography = shelf.typography as {
    fontFamily?: string;
    fontWeight?: string;
    titleSize?: string;
    subtitleSize?: string;
    textColor?: string;
  } || {};

  return (
    <Link href={`/writer/library/${shelf.id}`} onClick={onClick}>
      <div className="group relative h-[320px] w-[220px] cursor-pointer overflow-hidden rounded-2xl border border-black/5 dark:border-white/5 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-all duration-500 hover:scale-[1.02]">
        {/* Cover Background */}
        <div className="absolute inset-0" style={coverStyle} />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20" />
        
        {/* Decorative Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '24px 24px'
          }} />
        </div>

        {/* Book Count Badge (top right) */}
        {bookCount !== undefined && (
          <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-md">
            <span className="text-[12px] font-medium text-white">
              {bookCount} {bookCount === 1 ? 'book' : 'books'}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h3
            className="mb-2 text-[22px] font-bold leading-tight text-white drop-shadow-lg"
            style={{
              fontFamily: typography.fontFamily || 'inherit',
              fontWeight: typography.fontWeight || '700',
              fontSize: typography.titleSize || '22px',
              color: typography.textColor || '#ffffff',
            }}
          >
            {shelf.name}
          </h3>
          {shelf.subtitle && (
            <p
              className="mb-3 line-clamp-2 text-[14px] leading-relaxed text-white/85"
              style={{
                fontFamily: typography.fontFamily || 'inherit',
                fontSize: typography.subtitleSize || '14px',
              }}
            >
              {shelf.subtitle}
            </p>
          )}
          
          {/* View Shelf Button */}
          <div className="mt-4 flex items-center gap-2 text-[13px] font-medium text-white/90">
            <span>View shelf</span>
            <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* Hover Glow Effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#907AFF]/0 via-[#907AFF]/0 to-[#907AFF]/0 transition-all duration-500 group-hover:from-[#907AFF]/10 group-hover:via-[#E29ED5]/5 group-hover:to-transparent" />
      </div>
    </Link>
  );
}
