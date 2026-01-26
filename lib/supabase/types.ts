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
      books: {
        Row: {
          id: string
          title: string
          description: string | null
          cover_url: string | null
          author_id: string
          published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          cover_url?: string | null
          author_id: string
          published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          cover_url?: string | null
          author_id?: string
          published?: boolean
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: 'writer' | 'reader'
    }
  }
}

export type User = Database['public']['Tables']['users']['Row']
export type Book = Database['public']['Tables']['books']['Row']
export type Chapter = Database['public']['Tables']['chapters']['Row']
