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
type Book = Database['public']['Tables']['library_books']['Row'];

export interface ShelfWithDetails extends Shelf {
  sections: ShelfSection[];
  shelf_books: (ShelfBook & {
    book: Book;
  })[];
}

// Get all shelves for current user
export async function getShelves(): Promise<ShelfWithDetails[]> {
  const supabase = createClient();
  
  // First check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.warn("User not authenticated, returning empty shelves");
    return [];
  }
  
  // Try query with relations first
  let { data, error } = await supabase
    .from('shelves')
    .select(`
      *,
      shelf_sections(*),
      shelf_books(
        *,
        library_books(*)
      )
    `)
    .order('sort_index', { ascending: true });

  // If relation query fails, try simpler approach
  if (error) {
    console.warn("Relation query failed, trying simpler approach:", error);
    
    // Check if it's a table doesn't exist error
    const isTableMissing = error.code === '42P01' || 
      error.message?.includes('does not exist') || 
      error.message?.includes('relation') && error.message?.includes('does not exist') ||
      error.message?.includes('permission denied') ||
      error.code === 'PGRST116';
    
    if (isTableMissing) {
      console.warn("Shelves table does not exist yet. Please run the migration: packages/db/supabase/migrations/00003_library_shelves_books.sql");
      return [];
    }
    
    // Try simple query first
    const { data: simpleData, error: simpleError } = await supabase
      .from('shelves')
      .select('*')
      .order('sort_index', { ascending: true });
    
    if (simpleError) {
      // If table doesn't exist, return empty array
      const isSimpleTableMissing = simpleError.code === '42P01' || 
        simpleError.message?.includes('does not exist') || 
        simpleError.message?.includes('relation') && simpleError.message?.includes('does not exist') ||
        simpleError.message?.includes('permission denied') ||
        simpleError.code === 'PGRST116';
      
      if (isSimpleTableMissing) {
      console.warn("Shelves table does not exist yet. Please run the migration: packages/db/supabase/migrations/00003_library_shelves_books.sql");
        return [];
      }
      
      // For any other error, log but don't crash - return empty array
      console.warn("Error fetching shelves (non-critical):", simpleError);
      return [];
    }
    
    // Manually fetch related data
    const shelvesWithDetails = await Promise.all(
      (simpleData || []).map(async (shelf) => {
        const [sectionsResult, booksResult] = await Promise.all([
          supabase.from('shelf_sections').select('*').eq('shelf_id', shelf.id).order('sort_index'),
          supabase.from('shelf_books').select('*').eq('shelf_id', shelf.id).order('sort_index'),
        ]);
        
        // Fetch books for each shelf_book
        const booksWithDetails = await Promise.all(
          (booksResult.data || []).map(async (shelfBook) => {
            const { data: bookData } = await supabase
              .from('library_books')
              .select('*')
              .eq('id', shelfBook.book_id)
              .single();
            
            return {
              ...shelfBook,
              book: bookData || null,
            };
          })
        );
        
        return {
          ...shelf,
          sections: sectionsResult.data || [],
          shelf_books: booksWithDetails.filter(sb => sb.book !== null),
        } as ShelfWithDetails;
      })
    );
    
    return shelvesWithDetails;
  }
  
  // Transform data to match expected structure
  const transformed = (data || []).map((shelf: any) => ({
    ...shelf,
    sections: shelf.shelf_sections || [],
    shelf_books: (shelf.shelf_books || []).map((sb: any) => ({
      ...sb,
      book: sb.library_books || sb.book || null,
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
    .from('shelves')
    .select(`
      *,
      shelf_sections!shelf_sections_shelf_id_fkey(*),
      shelf_books!shelf_books_shelf_id_fkey(
        *,
        library_books!shelf_books_book_id_fkey(*)
      )
    `)
    .eq('id', shelfId)
    .single();

  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      console.warn("Shelves table does not exist yet");
      return null;
    }
    throw error;
  }
  
  if (!data) return null;
  
  // Transform data to match expected structure
  return {
    ...data,
    sections: data.shelf_sections || [],
    shelf_books: data.shelf_books || [],
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
  author?: string;
  cover_url?: string;
  summary?: string;
  authors_note?: string;
  content?: string;
  tags?: string[];
}): Promise<Book> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');
  
  const { data: bookData, error: bookError } = await supabase
    .from('library_books')
    .insert({
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
      summary: book.summary,
      authors_note: book.authors_note,
      content: book.content,
      tags: book.tags,
      user_id: user.id,
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
    .from('library_books')
    .select('*')
    .eq('user_id', user.id);
  
  if (allBooksError) {
    // If table doesn't exist, return empty array
    const isTableMissing = allBooksError.code === '42P01' || 
      allBooksError.message?.includes('does not exist') ||
      allBooksError.message?.includes('permission denied') ||
      allBooksError.code === 'PGRST116';
    
    if (isTableMissing) {
      console.warn("Library books table does not exist yet");
      return [];
    }
    
    // For any other error, log but don't crash - return empty array
    console.warn("Error fetching books (non-critical):", allBooksError);
    return [];
  }
  
  // Try to get shelf_books, but don't fail if table doesn't exist
  const { data: shelfBooks, error: shelfBooksError } = await supabase
    .from('shelf_books')
    .select('book_id');
  
  // If shelf_books table doesn't exist, all books are standalone
  if (shelfBooksError) {
    const isTableMissing = shelfBooksError.code === '42P01' || 
      shelfBooksError.message?.includes('does not exist') ||
      shelfBooksError.message?.includes('permission denied') ||
      shelfBooksError.code === 'PGRST116';
    
    if (isTableMissing) {
      console.warn("shelf_books table does not exist yet, returning all books as standalone");
      return (allBooks || []);
    }
    // For other errors, log but continue - assume all books are standalone
    console.warn("Error fetching shelf_books (non-critical):", shelfBooksError);
  }
  
  const bookIdsInShelves = new Set(shelfBooks?.map(sb => sb.book_id) || []);
  
  // Filter out books that are in shelves
  return (allBooks || []).filter(book => !bookIdsInShelves.has(book.id));
}
