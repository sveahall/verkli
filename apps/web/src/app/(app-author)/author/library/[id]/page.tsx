"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getShelf, updateShelf, createSection, updateSection, deleteSection, addBookToShelf, moveBook, removeBookFromShelf, reorderBooks, reorderSections } from "@/lib/supabase/shelves-client";
import type { ShelfWithDetails } from "@/lib/supabase/shelves-client";
import SectionBlock from "@/components/library/SectionBlock";
import BookCard from "@/components/library/BookCard";

export default function ShelfDetailPage() {
  const params = useParams();
  const router = useRouter();
  const shelfId = params.id as string;
  
  const [shelf, setShelf] = useState<ShelfWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [showCreateSectionModal, setShowCreateSectionModal] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [draggedBookId, setDraggedBookId] = useState<string | null>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    subtitle: "",
    coverType: "image" as "image" | "gradient",
    cover: "",
    coverGradient: "",
    typography: {
      fontFamily: "Inter",
      fontWeight: "600",
      titleSize: "20px",
      subtitleSize: "14px",
      textColor: "#ffffff",
    },
  });
  
  // New section form
  const [sectionName, setSectionName] = useState("");
  
  // New book form
  const [bookForm, setBookForm] = useState({
    title: "",
    cover: "",
  });

  useEffect(() => {
    loadShelf();
  }, [shelfId]);

  const loadShelf = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/author/signin");
        return;
      }
      const data = await getShelf(shelfId);
      if (data) {
        setShelf(data);
        setEditForm({
          name: data.name,
          subtitle: data.subtitle || "",
          coverType: data.cover_type || "image",
          cover: data.cover_url || "",
          coverGradient: data.cover_gradient || "",
          typography: (data.typography as any) || {
            fontFamily: "Inter",
            fontWeight: "600",
            titleSize: "20px",
            subtitleSize: "14px",
            textColor: "#ffffff",
          },
        });
      }
    } catch (error) {
      console.error("Error loading shelf:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateShelf = async () => {
    if (!shelf) return;
    
    try {
      await updateShelf(shelfId, {
        name: editForm.name,
        subtitle: editForm.subtitle || null,
        cover_type: editForm.coverType,
        cover_url: editForm.coverType === "image" ? editForm.cover || null : null,
        cover_gradient: editForm.coverType === "gradient" ? editForm.coverGradient || null : null,
        typography: editForm.typography,
      });
      await loadShelf();
      setShowEditPanel(false);
    } catch (error) {
      console.error("Error updating shelf:", error);
    }
  };

  const handleCreateSection = async () => {
    if (!shelf || !sectionName.trim()) return;
    
    try {
      const maxSortIndex = shelf.sections.length > 0 
        ? Math.max(...shelf.sections.map(s => s.sort_index))
        : -1;
      
      await createSection({
        shelf_id: shelfId,
        name: sectionName.trim(),
        sort_index: maxSortIndex + 1,
      });
      setSectionName("");
      setShowCreateSectionModal(false);
      await loadShelf();
    } catch (error) {
      console.error("Error creating section:", error);
    }
  };

  const handleAddBook = async () => {
    if (!shelf || !bookForm.title.trim()) return;
    
    try {
      // Create book first
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const slug = bookForm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
      const { data: book, error: bookError } = await supabase
        .from('books')
        .insert({
          title: bookForm.title,
          slug: slug,
          cover_image: bookForm.cover || null,
          author_id: user.id,
          status: 'DRAFT',
        })
        .select('id')
        .single();
      
      if (bookError) throw bookError;
      
      // Add to shelf
      const maxSortIndex = shelf.shelf_books
        .filter(sb => sb.section_id === selectedSectionId)
        .reduce((max, sb) => Math.max(max, sb.sort_index), -1);
      
      await addBookToShelf({
        shelf_id: shelfId,
        book_id: book.id,
        section_id: selectedSectionId,
        sort_index: maxSortIndex + 1,
      });
      
      setBookForm({ title: "", cover: "" });
      setShowAddBookModal(false);
      setSelectedSectionId(null);
      
      // Navigate to the book editor
      router.push(`/author/books/${book.id}`);
    } catch (error) {
      console.error("Error adding book:", error);
    }
  };

  const handleMoveBook = async (shelfBookId: string, targetSectionId: string | null) => {
    if (!shelf) return;
    
    try {
      const shelfBook = shelf.shelf_books.find(sb => sb.id === shelfBookId);
      if (!shelfBook) return;
      
      const maxSortIndex = shelf.shelf_books
        .filter(sb => sb.section_id === targetSectionId)
        .reduce((max, sb) => Math.max(max, sb.sort_index), -1);
      
      await moveBook(shelfBookId, targetSectionId, maxSortIndex + 1);
      await loadShelf();
    } catch (error) {
      console.error("Error moving book:", error);
    }
  };

  const handleDeleteBook = async (shelfBookId: string) => {
    try {
      await removeBookFromShelf(shelfBookId);
      await loadShelf();
    } catch (error) {
      console.error("Error deleting book:", error);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      await deleteSection(sectionId);
      await loadShelf();
    } catch (error) {
      console.error("Error deleting section:", error);
    }
  };

  const handleDragStart = (shelfBookId: string) => {
    setDraggedBookId(shelfBookId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetSectionId: string | null) => {
    e.preventDefault();
    if (!draggedBookId || !shelf) return;

    try {
      const shelfBook = shelf.shelf_books.find(sb => sb.id === draggedBookId);
      if (!shelfBook) return;

      const maxSortIndex = shelf.shelf_books
        .filter(sb => sb.section_id === targetSectionId)
        .reduce((max, sb) => Math.max(max, sb.sort_index), -1);

      await moveBook(draggedBookId, targetSectionId, maxSortIndex + 1);
      setDraggedBookId(null);
      await loadShelf();
    } catch (error) {
      console.error("Error moving book:", error);
      setDraggedBookId(null);
    }
  };

  const handleReorderBooks = async (sectionId: string | null, bookIds: string[]) => {
    try {
      await reorderBooks(shelfId, sectionId, bookIds);
      await loadShelf();
    } catch (error) {
      console.error("Error reordering books:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#907AFF]"></div>
      </div>
    );
  }

  if (!shelf) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Shelf not found</h1>
          <Link href="/author/home" className="mt-4 text-[#907AFF] hover:underline">
            Back to library
          </Link>
        </div>
      </div>
    );
  }

  const typography = shelf.typography as {
    fontFamily?: string;
    fontWeight?: string;
    titleSize?: string;
    subtitleSize?: string;
    textColor?: string;
  } || {};

  const coverStyle = shelf.cover_type === 'gradient' && shelf.cover_gradient
    ? { background: shelf.cover_gradient }
    : shelf.cover_url
    ? { backgroundImage: `url(${shelf.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(135deg, #907AFF 0%, #E29ED5 100%)' };

  // Group books by section
  const booksBySection = shelf.sections.reduce((acc, section) => {
    acc[section.id] = shelf.shelf_books.filter(sb => sb.section_id === section.id);
    return acc;
  }, {} as Record<string, typeof shelf.shelf_books>);
  
  const unsectionedBooks = shelf.shelf_books.filter(sb => !sb.section_id);

  return (
    <main className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Kontextrad – ingen dubbel navbar, global nav finns redan i layout */}
      <div className="mx-auto max-w-[1400px] px-6 pt-4 pb-2">
        <div className="flex items-center justify-between gap-4">
          <Link href="/author/home" className="text-[15px] font-medium text-slate-600 dark:text-white/60 transition-colors hover:text-slate-900 dark:hover:text-white">
            ← Back to Library
          </Link>
          <button
            onClick={() => setShowEditPanel(true)}
            className="rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.06]"
          >
            Edit shelf
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-6">
        {/* Shelf Header */}
        <div className="mb-12 h-[400px] overflow-hidden rounded-3xl" style={coverStyle}>
          <div className="flex h-full flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent p-10">
            <h1
              className="text-[48px] font-semibold text-white"
              style={{
                fontFamily: typography.fontFamily || 'inherit',
                fontWeight: typography.fontWeight || '600',
                fontSize: typography.titleSize || '48px',
                color: typography.textColor || '#ffffff',
              }}
            >
              {shelf.name}
            </h1>
            {shelf.subtitle && (
              <p
                className="mt-2 text-[20px] text-white/80"
                style={{
                  fontFamily: typography.fontFamily || 'inherit',
                  fontSize: typography.subtitleSize || '20px',
                }}
              >
                {shelf.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedSectionId(null);
              setShowAddBookModal(true);
            }}
            className="rounded-full bg-[#907AFF] px-6 py-2.5 text-[15px] font-medium text-white transition-all hover:bg-[#8069EE]"
          >
            Add book
          </button>
          <button
            onClick={() => setShowCreateSectionModal(true)}
            className="rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-6 py-2.5 text-[15px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.06]"
          >
            Create section
          </button>
        </div>

        {/* Sections */}
        {shelf.sections
          .sort((a, b) => a.sort_index - b.sort_index)
          .map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              books={booksBySection[section.id] || []}
              onAddBook={() => {
                setSelectedSectionId(section.id);
                setShowAddBookModal(true);
              }}
              onMoveBook={handleMoveBook}
              onDeleteBook={handleDeleteBook}
              onRenameSection={async (sectionId, newName) => {
                await updateSection(sectionId, { name: newName });
                await loadShelf();
              }}
              onDeleteSection={handleDeleteSection}
              onReorderBooks={(bookIds) => handleReorderBooks(section.id, bookIds)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))}

        {/* Unsectioned Books */}
        {unsectionedBooks.length > 0 && (
          <div className="mb-8 rounded-2xl border border-black/10 dark:border-white/[0.08] bg-gradient-to-b from-black/5 dark:from-white/[0.04] to-transparent p-6">
            <h3 className="mb-6 text-[20px] font-semibold text-slate-900 dark:text-white">Books</h3>
            <div 
              className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, null)}
            >
              {unsectionedBooks
                .sort((a, b) => a.sort_index - b.sort_index)
                .map((shelfBook) => (
                  <div
                    key={shelfBook.id}
                    draggable
                    onDragStart={() => handleDragStart(shelfBook.id)}
                    className="cursor-move"
                  >
                    <BookCard
                      book={shelfBook.book}
                      size="sm"
                      onClick={() => router.push(`/author/books/${shelfBook.book.id}`)}
                      onAction={(action) => {
                        if (action === "delete") {
                          handleDeleteBook(shelfBook.id);
                        }
                      }}
                      showStats={false}
                    />
                  </div>
                ))}
              <button
                onClick={() => {
                  setSelectedSectionId(null);
                  setShowAddBookModal(true);
                }}
                className="group flex h-[200px] w-[140px] items-center justify-center rounded-2xl border-2 border-dashed border-black/20 dark:border-white/10 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-all duration-300 hover:border-[#907AFF]/50 hover:bg-gradient-to-br hover:from-[#907AFF]/5 hover:to-[#E29ED5]/5"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20 transition-all duration-300 group-hover:scale-110 group-hover:from-[#907AFF]/30 group-hover:to-[#E29ED5]/30">
                    <svg className="h-6 w-6 text-[#907AFF] transition-colors group-hover:text-[#8069EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-[13px] font-medium text-slate-600 dark:text-white/50 transition-colors group-hover:text-[#907AFF] dark:group-hover:text-[#907AFF]">
                    Add book
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Shelf Panel */}
      {showEditPanel && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-[800px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-8 backdrop-blur-xl">
            <button onClick={() => setShowEditPanel(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="mb-6 text-[28px] font-semibold text-slate-900 dark:text-white">Edit shelf</h2>
            
            {/* Same form fields as Create shelf modal */}
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Shelf name"
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-2.5 text-[20px] font-semibold text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06]"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={editForm.subtitle}
                  onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                  placeholder="Optional subtitle"
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-2.5 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06]"
                />
              </div>
              
              {/* Cover chooser - same as create modal */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">Cover</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditForm({ ...editForm, coverType: "image" })}
                      className={`rounded-lg px-3 py-1 text-[12px] transition-all ${
                        editForm.coverType === "image"
                          ? "bg-[#907AFF] text-white"
                          : "bg-black/[0.02] dark:bg-white/[0.02] text-slate-600 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      Image
                    </button>
                    <button
                      onClick={() => setEditForm({ ...editForm, coverType: "gradient" })}
                      className={`rounded-lg px-3 py-1 text-[12px] transition-all ${
                        editForm.coverType === "gradient"
                          ? "bg-[#907AFF] text-white"
                          : "bg-black/[0.02] dark:bg-white/[0.02] text-slate-600 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                </div>
                
                {editForm.coverType === "image" ? (
                  <>
                    <button className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]">
                      <span className="text-[14px] text-slate-700 dark:text-white/70">+ Add shelf cover</span>
                      <input type="file" accept="image/*" className="hidden" id="edit-shelf-cover" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => setEditForm({ ...editForm, cover: e.target?.result as string });
                          reader.readAsDataURL(file);
                        }
                      }} />
                      <label htmlFor="edit-shelf-cover" className="cursor-pointer text-[#907AFF]">Upload</label>
                    </button>
                    {editForm.cover && (
                      <div className="relative mt-2 h-48 w-32 overflow-hidden rounded-lg">
                        <img src={editForm.cover} alt="Shelf cover" className="h-full w-full object-cover" />
                        <button onClick={() => setEditForm({ ...editForm, cover: "" })} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:bg-black/80">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
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
                          onClick={() => setEditForm({ ...editForm, coverGradient: gradient })}
                          className={`h-16 rounded-lg transition-all ${
                            editForm.coverGradient === gradient ? "ring-2 ring-[#907AFF] ring-offset-2" : ""
                          }`}
                          style={{ background: gradient }}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      value={editForm.coverGradient}
                      onChange={(e) => setEditForm({ ...editForm, coverGradient: e.target.value })}
                      placeholder="Or enter custom gradient CSS"
                      className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06]"
                    />
                  </div>
                )}
              </div>

              {/* Typography Settings - same as create modal */}
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-4">
                <h4 className="mb-4 text-[14px] font-medium text-slate-700 dark:text-white/70">Typography Settings</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Font Family</label>
                    <select
                      value={editForm.typography.fontFamily}
                      onChange={(e) => setEditForm({ ...editForm, typography: { ...editForm.typography, fontFamily: e.target.value } })}
                      className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2 text-[13px] text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50"
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
                      value={editForm.typography.fontWeight}
                      onChange={(e) => setEditForm({ ...editForm, typography: { ...editForm.typography, fontWeight: e.target.value } })}
                      className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2 text-[13px] text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50"
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
                        value={editForm.typography.titleSize}
                        onChange={(e) => setEditForm({ ...editForm, typography: { ...editForm.typography, titleSize: e.target.value } })}
                        placeholder="20px"
                        className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Subtitle Size</label>
                      <input
                        type="text"
                        value={editForm.typography.subtitleSize}
                        onChange={(e) => setEditForm({ ...editForm, typography: { ...editForm.typography, subtitleSize: e.target.value } })}
                        placeholder="14px"
                        className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-600 dark:text-white/50">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editForm.typography.textColor}
                        onChange={(e) => setEditForm({ ...editForm, typography: { ...editForm.typography, textColor: e.target.value } })}
                        className="h-10 w-20 cursor-pointer rounded-lg border border-black/10 dark:border-white/10"
                      />
                      <input
                        type="text"
                        value={editForm.typography.textColor}
                        onChange={(e) => setEditForm({ ...editForm, typography: { ...editForm.typography, textColor: e.target.value } })}
                        placeholder="#ffffff"
                        className="flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-3 py-2 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setShowEditPanel(false)}
                className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-6 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateShelf}
                className="rounded-xl bg-[#907AFF] px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#8069EE]"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Section Modal */}
      {showCreateSectionModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-[500px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-8 backdrop-blur-xl">
              <button onClick={() => setShowCreateSectionModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="mb-6 text-[28px] font-semibold text-slate-900 dark:text-white">Create section</h2>
              <input
                type="text"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="Section name"
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[16px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSection();
                }}
                autoFocus
              />
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateSectionModal(false)}
                  className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-6 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.04]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSection}
                  className="rounded-xl bg-[#907AFF] px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#8069EE]"
                >
                  Create section
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Book Modal */}
        {showAddBookModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-[600px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-8 backdrop-blur-xl">
              <button onClick={() => setShowAddBookModal(false)} className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="mb-6 text-[28px] font-semibold text-slate-900 dark:text-white">Add book to shelf</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[14px] font-medium text-slate-700 dark:text-white/70">Book title</label>
                  <input
                    type="text"
                    value={bookForm.title}
                    onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                    placeholder="Enter book title"
                    className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[16px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[14px] font-medium text-slate-700 dark:text-white/70">Book cover</label>
                  <button className="flex w-full items-center justify-between rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/10 dark:hover:bg-white/[0.04]">
                    <span className="text-[14px] text-slate-700 dark:text-white/70">+ Add book cover</span>
                    <input type="file" accept="image/*" className="hidden" id="book-cover-upload" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => setBookForm({ ...bookForm, cover: e.target?.result as string });
                        reader.readAsDataURL(file);
                      }
                    }} />
                    <label htmlFor="book-cover-upload" className="cursor-pointer text-[#907AFF]">Upload</label>
                  </button>
                  {bookForm.cover && (
                    <div className="relative mt-2 h-48 w-32 overflow-hidden rounded-lg">
                      <img src={bookForm.cover} alt="Book cover" className="h-full w-full object-cover" />
                      <button onClick={() => setBookForm({ ...bookForm, cover: "" })} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:bg-black/80">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button
                  onClick={() => setShowAddBookModal(false)}
                  className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-6 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.04]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddBook}
                  className="rounded-xl bg-[#907AFF] px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#8069EE]"
                >
                  Add book
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}
