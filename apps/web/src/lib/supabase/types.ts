// Database types - synced with Supabase schema
// Regenerate with: npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.generated.ts

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          avatar_url: string | null
          role: 'author' | 'reader'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name?: string | null
          avatar_url?: string | null
          role?: 'author' | 'reader'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          avatar_url?: string | null
          role?: 'author' | 'reader'
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
          role: 'author' | 'reader'
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
          role?: 'author' | 'reader'
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
          role?: 'author' | 'reader'
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
          cover_image: string | null
          author_id: string
          status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
          published: boolean
          published_at: string | null
          featured: boolean | null
          featured_rank: number | null
          is_translation: boolean
          original_book_id: string | null
          translation_status: 'draft' | 'needs_review' | 'ready' | 'published' | null
          language: string | null
          original_source: string | null
          original_url: string | null
          audiobook_status: 'not_started' | 'ready' | 'generating' | 'published' | 'failed' | null
          is_featured: boolean
          featured_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          slug: string
          description?: string | null
          cover_image?: string | null
          author_id: string
          status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
          published?: boolean
          published_at?: string | null
          featured?: boolean | null
          featured_rank?: number | null
          is_translation?: boolean
          original_book_id?: string | null
          translation_status?: 'draft' | 'needs_review' | 'ready' | 'published' | null
          language?: string | null
          original_source?: string | null
          original_url?: string | null
          audiobook_status?: 'not_started' | 'ready' | 'generating' | 'published' | 'failed' | null
          is_featured?: boolean
          featured_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          slug?: string
          description?: string | null
          cover_image?: string | null
          author_id?: string
          status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
          published?: boolean
          published_at?: string | null
          featured?: boolean | null
          featured_rank?: number | null
          is_translation?: boolean
          original_book_id?: string | null
          translation_status?: 'draft' | 'needs_review' | 'ready' | 'published' | null
          language?: string | null
          original_source?: string | null
          original_url?: string | null
          audiobook_status?: 'not_started' | 'ready' | 'generating' | 'published' | 'failed' | null
          is_featured?: boolean
          featured_until?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      chapters: {
        Row: {
          id: string
          book_id: string
          title: string
          content: string
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
          user_id: string | null
          name: string
          subtitle: string | null
          cover_url: string | null
          cover_type: 'image' | 'gradient'
          cover_gradient: string | null
          typography: Record<string, unknown> | null
          sort_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
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
          user_id?: string | null
          name?: string
          subtitle?: string | null
          cover_url?: string | null
          cover_type?: 'image' | 'gradient'
          cover_gradient?: string | null
          typography?: Record<string, unknown> | null
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
      audiobook_assets: {
        Row: {
          id: string
          book_id: string
          language: string
          status: 'generated' | 'failed'
          audio_url: string | null
          duration_seconds: number | null
          created_at: string
        }
        Insert: {
          id?: string
          book_id: string
          language?: string
          status?: 'generated' | 'failed'
          audio_url?: string | null
          duration_seconds?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          book_id?: string
          language?: string
          status?: 'generated' | 'failed'
          audio_url?: string | null
          duration_seconds?: number | null
          created_at?: string
        }
      }
      marketing_launch_copy: {
        Row: {
          id: string
          book_id: string
          language: string
          status: 'draft' | 'generated' | 'scheduled' | 'published'
          channel: 'generic' | 'tiktok' | 'instagram' | 'x'
          headline: string | null
          caption: string | null
          cta: string | null
          hashtags: string | null
          share_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          book_id: string
          language?: string
          status?: 'draft' | 'generated' | 'scheduled' | 'published'
          channel?: 'generic' | 'tiktok' | 'instagram' | 'x'
          headline?: string | null
          caption?: string | null
          cta?: string | null
          hashtags?: string | null
          share_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          book_id?: string
          language?: string
          status?: 'draft' | 'generated' | 'scheduled' | 'published'
          channel?: 'generic' | 'tiktok' | 'instagram' | 'x'
          headline?: string | null
          caption?: string | null
          cta?: string | null
          hashtags?: string | null
          share_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      marketing_campaigns: {
        Row: {
          id: string
          user_id: string
          book_id: string
          status: 'running' | 'done' | 'failed'
          goal: string
          tone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          book_id: string
          status?: 'running' | 'done' | 'failed'
          goal: string
          tone: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          book_id?: string
          status?: 'running' | 'done' | 'failed'
          goal?: string
          tone?: string
          created_at?: string
          updated_at?: string
        }
      }
      marketing_assets: {
        Row: {
          id: string
          campaign_id: string
          type: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          type: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          type?: string
          content?: string
          created_at?: string
        }
      }
      usage_counters: {
        Row: {
          user_id: string
          day: string
          key: string
          count: number
          updated_at: string
        }
        Insert: {
          user_id: string
          day: string
          key: string
          count?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          day?: string
          key?: string
          count?: number
          updated_at?: string
        }
      }
      ai_jobs: {
        Row: {
          id: string
          user_id: string
          kind: string
          status: 'pending' | 'running' | 'done' | 'failed'
          input: Record<string, unknown> | null
          output: Record<string, unknown> | null
          error: string | null
          created_at: string
          started_at: string | null
          finished_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          kind: string
          status?: 'pending' | 'running' | 'done' | 'failed'
          input?: Record<string, unknown> | null
          output?: Record<string, unknown> | null
          error?: string | null
          created_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          kind?: string
          status?: 'pending' | 'running' | 'done' | 'failed'
          input?: Record<string, unknown> | null
          output?: Record<string, unknown> | null
          error?: string | null
          created_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
      }
      curated_lists: {
        Row: {
          id: string
          slug: string
          title: string
          language: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          language?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          language?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      curated_list_items: {
        Row: {
          id: string
          list_id: string
          book_id: string
          rank: number
          created_at: string
        }
        Insert: {
          id?: string
          list_id: string
          book_id: string
          rank?: number
          created_at?: string
        }
        Update: {
          id?: string
          list_id?: string
          book_id?: string
          rank?: number
          created_at?: string
        }
      }
      readings: {
        Row: {
          id: string
          user_id: string
          book_id: string
          current_chapter: number
          progress_percent: number
          started_at: string
          last_read_at: string
          chapter_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          book_id: string
          current_chapter?: number
          progress_percent?: number
          started_at?: string
          last_read_at?: string
          chapter_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          book_id?: string
          current_chapter?: number
          progress_percent?: number
          started_at?: string
          last_read_at?: string
          chapter_id?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: 'author' | 'reader'
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
export type AudiobookAsset = Database['public']['Tables']['audiobook_assets']['Row']
export type MarketingLaunchCopy = Database['public']['Tables']['marketing_launch_copy']['Row']
export type MarketingCampaign = Database['public']['Tables']['marketing_campaigns']['Row']
export type MarketingAsset = Database['public']['Tables']['marketing_assets']['Row']
export type CuratedList = Database['public']['Tables']['curated_lists']['Row']
export type CuratedListItem = Database['public']['Tables']['curated_list_items']['Row']
export type Reading = Database['public']['Tables']['readings']['Row']
