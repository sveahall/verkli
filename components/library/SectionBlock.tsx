"use client";

import { useState } from "react";
import BookCard from "./BookCard";
import type { ShelfSection, ShelfBook, Book } from "@/lib/supabase/types";

interface SectionBlockProps {
  section: ShelfSection;
  books: (ShelfBook & { book: Book })[];
  onAddBook?: () => void;
  onMoveBook?: (shelfBookId: string, targetSectionId: string | null) => void;
  onDeleteBook?: (shelfBookId: string) => void;
  onRenameSection?: (sectionId: string, newName: string) => void;
  onDeleteSection?: (sectionId: string) => void;
  onReorderBooks?: (bookIds: string[]) => void;
  onDragStart?: (shelfBookId: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, targetSectionId: string | null) => void;
}

export default function SectionBlock({
  section,
  books,
  onAddBook,
  onMoveBook,
  onDeleteBook,
  onRenameSection,
  onDeleteSection,
  onReorderBooks,
  onDragStart,
  onDragOver,
  onDrop,
}: SectionBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [sectionName, setSectionName] = useState(section.name);

  const handleSave = () => {
    if (sectionName.trim() && onRenameSection) {
      onRenameSection(section.id, sectionName.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="mb-8 rounded-2xl border border-black/10 dark:border-white/[0.08] bg-gradient-to-b from-black/5 dark:from-white/[0.04] to-transparent p-6">
      {/* Section Header */}
      <div className="mb-5 flex items-center justify-between">
        {isEditing ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") {
                  setSectionName(section.name);
                  setIsEditing(false);
                }
              }}
              className="flex-1 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/[0.04] px-4 py-2 text-[16px] font-semibold text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06]"
              autoFocus
            />
          </div>
        ) : (
          <>
            <h3
              className="text-[18px] font-semibold text-slate-900 dark:text-white"
              onClick={() => setIsEditing(true)}
            >
              {section.name}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-lg px-3 py-1.5 text-[13px] text-slate-600 dark:text-white/50 transition-colors hover:bg-black/5 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white/70"
              >
                Rename
              </button>
              {onDeleteSection && (
                <button
                  onClick={() => onDeleteSection(section.id)}
                  className="rounded-lg px-3 py-1.5 text-[13px] text-red-600 dark:text-red-400/80 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Books Grid */}
      <div 
        className="flex flex-wrap gap-5"
        onDragOver={onDragOver}
        onDrop={(e) => onDrop && onDrop(e, section.id)}
      >
        {books
          .sort((a, b) => a.sort_index - b.sort_index)
          .map((shelfBook) => (
            <div
              key={shelfBook.id}
              draggable
              onDragStart={() => onDragStart && onDragStart(shelfBook.id)}
              className="cursor-move"
            >
              <BookCard
                book={shelfBook.book}
                size="md"
                onClick={() => {
                  // Navigate to book detail
                  window.location.href = `/writer/books/${shelfBook.book.id}`;
                }}
                onAction={(action) => {
                  if (action === "delete" && onDeleteBook) {
                    onDeleteBook(shelfBook.id);
                  } else if (action === "move" && onMoveBook) {
                    // Open move modal
                    // This will be handled by parent component
                  }
                }}
              />
            </div>
          ))}
        {onAddBook && (
          <button
            onClick={onAddBook}
            className="flex h-[180px] w-[120px] items-center justify-center rounded-xl border-2 border-dashed border-black/20 dark:border-white/10 bg-black/5 dark:bg-white/[0.02] transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]"
          >
            <div className="flex flex-col items-center gap-2">
              <svg
                className="h-8 w-8 text-slate-400 dark:text-white/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="text-[11px] text-slate-500 dark:text-white/30">Add book</span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
