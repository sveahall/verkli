"use client";

import { createClient } from './client';
import type { Database } from './types';

type Shelf = Database['public']['Tables']['shelves']['Row'];
type ShelfInsert = Database['public']['Tables']['shelves']['Insert'];
type ShelfUpdate = Database['public']['Tables']['shelves']['Update'];
type ShelfSection = Database['public']['Tables']['shelf_sections']['Row'];
type ShelfSectionInsert = Database['public']['Tables']['shelf_sections']['Insert'];
type ShelfBook = Database['public']['Tables']['shelf_books']['Row'];
type ShelfBookInsert = Database['public']['Tables']['shelf_books']['Insert'];
type Book = Database['public']['Tables']['books']['Row'];

export interface ShelfWithDetails extends Shelf {
  sections: ShelfSection[];
  shelf_books: (ShelfBook & {
    book: Book;
  })[];
}

// Get all shelves for current user
export async function getShelves(): Promise<ShelfWithDetails[]> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.warn("User not authenticated, returning empty shelves");
    return [];
  }

  const { data, error } = await supabase
    .from("shelves")
    .select(
      `
      *,
      shelf_sections(*),
      shelf_books(
        *,
        books(*)
      )
    `,
    )
    .order("sort_index", { ascending: true });

  if (error) {
    throw error;
  }

  const transformed = (data || []).map((shelf: Shelf & { shelf_sections?: ShelfSection[]; shelf_books?: (ShelfBook & { books?: Book; book?: Book })[] }) => ({
    ...shelf,
    sections: shelf.shelf_sections || [],
    shelf_books: (shelf.shelf_books || []).map((sb: ShelfBook & { books?: Book; book?: Book }) => ({
      ...sb,
      book: sb.books || sb.book || null,
    })),
  }));

  return transformed as ShelfWithDetails[];
}

// Get single shelf with details
export async function getShelf(shelfId: string): Promise<ShelfWithDetails | null> {
  const supabase = createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.warn("User not authenticated");
    return null;
  }
  
  const { data, error } = await supabase
    .from("shelves")
    .select(
      `
      *,
      shelf_sections(*),
      shelf_books(
        *,
        books(*)
      )
    `,
    )
    .eq("id", shelfId)
    .single();

  if (error) throw error;
  
  if (!data) return null;

  const shelf_books = (data.shelf_books || [])
    .map(
      (
        sb: { books?: Book; book?: Book } & Record<string, unknown>,
      ) => ({
        ...sb,
        book: sb.books ?? sb.book ?? null,
      }),
    )
    .filter((sb: { book: Book | null }) => sb.book != null) as (ShelfBook & {
    book: Book;
  })[];
  
  return {
    ...data,
    sections: data.shelf_sections || [],
    shelf_books,
  } as ShelfWithDetails;
}

// Create shelf
export async function createShelf(shelf: Omit<ShelfInsert, 'user_id'>): Promise<Shelf> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('shelves')
    .insert({ ...shelf, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update shelf
export async function updateShelf(shelfId: string, updates: ShelfUpdate): Promise<Shelf> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('shelves')
    .update(updates)
    .eq('id', shelfId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Delete shelf
export async function deleteShelf(shelfId: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase
    .from('shelves')
    .delete()
    .eq('id', shelfId);

  if (error) throw error;
}

// Create section
export async function createSection(section: Omit<ShelfSectionInsert, 'id'>): Promise<ShelfSection> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('shelf_sections')
    .insert(section)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update section
export async function updateSection(sectionId: string, updates: Partial<ShelfSection>): Promise<ShelfSection> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('shelf_sections')
    .update(updates)
    .eq('id', sectionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Delete section
export async function deleteSection(sectionId: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase
    .from('shelf_sections')
    .delete()
    .eq('id', sectionId);

  if (error) throw error;
}

// Add book to shelf
export async function addBookToShelf(shelfBook: Omit<ShelfBookInsert, 'id'>): Promise<ShelfBook> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('shelf_books')
    .insert(shelfBook)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Move book between sections or to unsectioned
export async function moveBook(shelfBookId: string, sectionId: string | null, sortIndex: number): Promise<ShelfBook> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('shelf_books')
    .update({ section_id: sectionId, sort_index: sortIndex })
    .eq('id', shelfBookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Remove book from shelf
export async function removeBookFromShelf(shelfBookId: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase
    .from('shelf_books')
    .delete()
    .eq('id', shelfBookId);

  if (error) throw error;
}

// Reorder sections
export async function reorderSections(shelfId: string, sectionIds: string[]): Promise<void> {
  const supabase = createClient();
  
  for (let i = 0; i < sectionIds.length; i++) {
    const { error } = await supabase
      .from('shelf_sections')
      .update({ sort_index: i })
      .eq('id', sectionIds[i])
      .eq('shelf_id', shelfId);

    if (error) throw error;
  }
}

// Reorder books
export async function reorderBooks(shelfId: string, sectionId: string | null, bookIds: string[]): Promise<void> {
  const supabase = createClient();
  
  for (let i = 0; i < bookIds.length; i++) {
    const query = supabase
      .from('shelf_books')
      .update({ sort_index: i })
      .eq('id', bookIds[i])
      .eq('shelf_id', shelfId);
    
    if (sectionId === null) {
      query.is('section_id', null);
    } else {
      query.eq('section_id', sectionId);
    }
    
    const { error } = await query;
    if (error) throw error;
  }
}

// Create standalone book
export async function createStandaloneBook(book: {
  title: string;
  cover_image?: string;
  description?: string;
}): Promise<Book> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');
  
  // Create book
  const slug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
  const { data: bookData, error: bookError } = await supabase
    .from('books')
    .insert({
      title: book.title,
      slug: slug,
      cover_image: book.cover_image,
      description: book.description,
      author_id: user.id,
      status: 'DRAFT',
      published: false,
    })
    .select()
    .single();

  if (bookError) throw bookError;
  return bookData;
}

// Get standalone books (books not in any shelf)
export async function getStandaloneBooks(): Promise<Book[]> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.warn("User not authenticated, returning empty books");
    return [];
  }
  
  // Get all books by user
  const { data: allBooks, error: allBooksError } = await supabase
    .from("books")
    .select("*")
    .eq("author_id", user.id);

  if (allBooksError) throw allBooksError;
  
  // Try to get shelf_books, but don't fail if table doesn't exist
  const { data: shelfBooks, error: shelfBooksError } = await supabase
    .from("shelf_books")
    .select("book_id");

  if (shelfBooksError) throw shelfBooksError;
  
  const bookIdsInShelves = new Set(shelfBooks?.map(sb => sb.book_id) || []);
  
  // Filter out books that are in shelves
  return (allBooks || []).filter(book => !bookIdsInShelves.has(book.id));
}
