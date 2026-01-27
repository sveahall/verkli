import { createClient } from './server';
import type { Database } from './types';

type Shelf = Database['public']['Tables']['shelves']['Row'];
type ShelfInsert = Database['public']['Tables']['shelves']['Insert'];
type ShelfUpdate = Database['public']['Tables']['shelves']['Update'];
type ShelfSection = Database['public']['Tables']['shelf_sections']['Row'];
type ShelfSectionInsert = Database['public']['Tables']['shelf_sections']['Insert'];
type ShelfBook = Database['public']['Tables']['shelf_books']['Row'];
type ShelfBookInsert = Database['public']['Tables']['shelf_books']['Insert'];

export interface ShelfWithDetails extends Shelf {
  sections: ShelfSection[];
  shelf_books: (ShelfBook & {
    book: Database['public']['Tables']['books']['Row'];
  })[];
}

// Get all shelves for current user
export async function getShelves(): Promise<ShelfWithDetails[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('shelves')
    .select(`
      *,
      sections:shelf_sections(*),
      shelf_books(
        *,
        book:books(*)
      )
    `)
    .order('sort_index', { ascending: true });

  if (error) throw error;
  return data as ShelfWithDetails[];
}

// Get single shelf with details
export async function getShelf(shelfId: string): Promise<ShelfWithDetails | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('shelves')
    .select(`
      *,
      sections:shelf_sections(*),
      shelf_books(
        *,
        book:books(*)
      )
    `)
    .eq('id', shelfId)
    .single();

  if (error) throw error;
  return data as ShelfWithDetails;
}

// Create shelf
export async function createShelf(shelf: ShelfInsert): Promise<Shelf> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('shelves')
    .insert(shelf)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update shelf
export async function updateShelf(shelfId: string, updates: ShelfUpdate): Promise<Shelf> {
  const supabase = await createClient();
  
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
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('shelves')
    .delete()
    .eq('id', shelfId);

  if (error) throw error;
}

// Create section
export async function createSection(section: ShelfSectionInsert): Promise<ShelfSection> {
  const supabase = await createClient();
  
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
  const supabase = await createClient();
  
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
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('shelf_sections')
    .delete()
    .eq('id', sectionId);

  if (error) throw error;
}

// Add book to shelf
export async function addBookToShelf(shelfBook: ShelfBookInsert): Promise<ShelfBook> {
  const supabase = await createClient();
  
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
  const supabase = await createClient();
  
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
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('shelf_books')
    .delete()
    .eq('id', shelfBookId);

  if (error) throw error;
}

// Reorder items (sections or books)
export async function reorderSections(shelfId: string, sectionIds: string[]): Promise<void> {
  const supabase = await createClient();
  
  const updates = sectionIds.map((id, index) => ({
    id,
    sort_index: index,
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('shelf_sections')
      .update({ sort_index: update.sort_index })
      .eq('id', update.id);

    if (error) throw error;
  }
}

export async function reorderBooks(shelfId: string, sectionId: string | null, bookIds: string[]): Promise<void> {
  const supabase = await createClient();
  
  const updates = bookIds.map((id, index) => ({
    id,
    sort_index: index,
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('shelf_books')
      .update({ sort_index: update.sort_index })
      .eq('id', update.id)
      .eq('shelf_id', shelfId)
      .eq(sectionId ? 'section_id' : 'section_id', sectionId);

    if (error) throw error;
  }
}
