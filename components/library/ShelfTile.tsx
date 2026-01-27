"use client";

import Link from "next/link";
import type { Shelf } from "@/lib/supabase/types";

interface ShelfTileProps {
  shelf: Shelf;
  onClick?: () => void;
}

export default function ShelfTile({ shelf, onClick }: ShelfTileProps) {
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
      <div className="group relative h-[280px] w-[200px] cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-[#907AFF]/20">
        {/* Cover */}
        <div className="absolute inset-0" style={coverStyle} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h3
            className="font-semibold text-white"
            style={{
              fontFamily: typography.fontFamily || 'inherit',
              fontWeight: typography.fontWeight || '600',
              fontSize: typography.titleSize || '20px',
              color: typography.textColor || '#ffffff',
            }}
          >
            {shelf.name}
          </h3>
          {shelf.subtitle && (
            <p
              className="mt-1 text-white/70"
              style={{
                fontFamily: typography.fontFamily || 'inherit',
                fontSize: typography.subtitleSize || '14px',
              }}
            >
              {shelf.subtitle}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
