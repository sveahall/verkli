// Database types - update these based on your Supabase schema
// You can generate these automatically with: npx supabase gen types typescript

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: 'writer' | 'reader'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'writer' | 'reader'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'writer' | 'reader'
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          user_id: string
          display_name: string | null
          username: string | null
          bio: string | null
          avatar_url: string | null
          role: 'writer' | 'reader'
          preferences: Record<string, any> | null
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name?: string | null
          username?: string | null
          bio?: string | null
          avatar_url?: string | null
          role?: 'writer' | 'reader'
          preferences?: Record<string, any> | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          display_name?: string | null
          username?: string | null
          bio?: string | null
          avatar_url?: string | null
          role?: 'writer' | 'reader'
          preferences?: Record<string, any> | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      books: {
        Row: {
          id: string
          title: string
          slug: string
          description: string | null
          cover_url: string | null
          author_id: string
          status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
          published: boolean
          created_at: string
          updated_at: string
          published_at: string | null
        }
        Insert: {
          id?: string
          title: string
          slug: string
          description?: string | null
          cover_url?: string | null
          author_id: string
          status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
          published?: boolean
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          slug?: string
          description?: string | null
          cover_url?: string | null
          author_id?: string
          status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
          published?: boolean
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
      }
      library_books: {
        Row: {
          id: string
          user_id: string
          title: string
          author: string | null
          cover_url: string | null
          summary: string | null
          authors_note: string | null
          content: string | null
          tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          author?: string | null
          cover_url?: string | null
          summary?: string | null
          authors_note?: string | null
          content?: string | null
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          author?: string | null
          cover_url?: string | null
          summary?: string | null
          authors_note?: string | null
          content?: string | null
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      chapters: {
        Row: {
          id: string
          book_id: string
          title: string
          content: string | null
          order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          book_id: string
          title: string
          content?: string | null
          order: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          book_id?: string
          title?: string
          content?: string | null
          order?: number
          created_at?: string
          updated_at?: string
        }
      }
      shelves: {
        Row: {
          id: string
          user_id: string
          name: string
          subtitle: string | null
          cover_url: string | null
          cover_type: 'image' | 'gradient'
          cover_gradient: string | null
          typography: Record<string, any> | null
          sort_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          subtitle?: string | null
          cover_url?: string | null
          cover_type?: 'image' | 'gradient'
          cover_gradient?: string | null
          typography?: Record<string, any> | null
          sort_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          subtitle?: string | null
          cover_url?: string | null
          cover_type?: 'image' | 'gradient'
          cover_gradient?: string | null
          typography?: Record<string, any> | null
          sort_index?: number
          created_at?: string
          updated_at?: string
        }
      }
      shelf_sections: {
        Row: {
          id: string
          shelf_id: string
          name: string
          sort_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shelf_id: string
          name: string
          sort_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shelf_id?: string
          name?: string
          sort_index?: number
          created_at?: string
          updated_at?: string
        }
      }
      shelf_books: {
        Row: {
          id: string
          shelf_id: string
          book_id: string
          section_id: string | null
          sort_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shelf_id: string
          book_id: string
          section_id?: string | null
          sort_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shelf_id?: string
          book_id?: string
          section_id?: string | null
          sort_index?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: 'writer' | 'reader'
    }
  }
}

export type User = Database['public']['Tables']['users']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Book = Database['public']['Tables']['books']['Row']
export type Chapter = Database['public']['Tables']['chapters']['Row']
export type Shelf = Database['public']['Tables']['shelves']['Row']
export type ShelfSection = Database['public']['Tables']['shelf_sections']['Row']
export type ShelfBook = Database['public']['Tables']['shelf_books']['Row']
