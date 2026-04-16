export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          book_id: string | null
          book_version_id: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json | null
          kind: string
          language: string | null
          output: Json | null
          progress: number
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id?: string | null
          book_version_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind: string
          language?: string | null
          output?: Json | null
          progress?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string | null
          book_version_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind?: string
          language?: string | null
          output?: Json | null
          progress?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_book_version_id_fkey"
            columns: ["book_version_id"]
            isOneToOne: false
            referencedRelation: "book_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          anon_id: string | null
          book_id: string | null
          created_at: string
          event_name: string
          event_type: string
          id: string
          ip_hash: string | null
          path: string | null
          props: Json
          referrer: string | null
          role: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          anon_id?: string | null
          book_id?: string | null
          created_at?: string
          event_name: string
          event_type: string
          id?: string
          ip_hash?: string | null
          path?: string | null
          props?: Json
          referrer?: string | null
          role?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          anon_id?: string | null
          book_id?: string | null
          created_at?: string
          event_name?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          path?: string | null
          props?: Json
          referrer?: string | null
          role?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      audiobook_assets: {
        Row: {
          audio_bucket: string | null
          audio_path: string | null
          audio_url: string | null
          book_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          language: string
          status: string
        }
        Insert: {
          audio_bucket?: string | null
          audio_path?: string | null
          audio_url?: string | null
          book_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          language?: string
          status?: string
        }
        Update: {
          audio_bucket?: string | null
          audio_path?: string | null
          audio_url?: string | null
          book_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          language?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiobook_assets_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          meta: Json
          request_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          meta?: Json
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          meta?: Json
          request_id?: string | null
        }
        Relationships: []
      }
      author_applications: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          has_published_before: boolean | null
          last_name: string | null
          published_books_url: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          has_published_before?: boolean | null
          last_name?: string | null
          published_books_url?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          has_published_before?: boolean | null
          last_name?: string | null
          published_books_url?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      author_followers: {
        Row: {
          author_id: string
          created_at: string
          follower_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          follower_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          follower_id?: string
        }
        Relationships: []
      }
      billing_accounts: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          plan: string | null
          role: Database["public"]["Enums"]["billing_role"]
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          plan?: string | null
          role: Database["public"]["Enums"]["billing_role"]
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          plan?: string | null
          role?: Database["public"]["Enums"]["billing_role"]
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          created_at: string
          stripe_customer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          stripe_customer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          stripe_customer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_plan_catalog: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          plan_key: string
          price_id: string
          product_id: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          role: Database["public"]["Enums"]["billing_role"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          plan_key: string
          price_id: string
          product_id?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          role: Database["public"]["Enums"]["billing_role"]
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          plan_key?: string
          price_id?: string
          product_id?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          role?: Database["public"]["Enums"]["billing_role"]
        }
        Relationships: []
      }
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          price_id: string | null
          status: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_id?: string | null
          status: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_id?: string | null
          status?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      book_club_members: {
        Row: {
          club_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          club_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          club_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      book_club_messages: {
        Row: {
          club_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          club_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          club_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_club_messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      book_clubs: {
        Row: {
          cover_url: string | null
          created_at: string
          creator_id: string
          current_book_id: string | null
          description: string | null
          id: string
          is_public: boolean
          max_members: number
          name: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          creator_id: string
          current_book_id?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          max_members?: number
          name: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          creator_id?: string
          current_book_id?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          max_members?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_clubs_current_book_id_fkey"
            columns: ["current_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_genres: {
        Row: {
          book_id: string
          genre_id: string
        }
        Insert: {
          book_id: string
          genre_id: string
        }
        Update: {
          book_id?: string
          genre_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_genres_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_genres_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["id"]
          },
        ]
      }
      book_imports: {
        Row: {
          author_id: string
          book_id: string | null
          book_version_id: string | null
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string
          file_storage: string
          id: string
          mode: string
          progress: number
          result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          book_id?: string | null
          book_version_id?: string | null
          created_at?: string
          error_message?: string | null
          file_name: string
          file_path: string
          file_storage?: string
          id?: string
          mode?: string
          progress?: number
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          book_id?: string | null
          book_version_id?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_storage?: string
          id?: string
          mode?: string
          progress?: number
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_imports_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_imports_book_version_id_fkey"
            columns: ["book_version_id"]
            isOneToOne: false
            referencedRelation: "book_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      book_versions: {
        Row: {
          book_id: string
          created_at: string
          error_message: string | null
          id: string
          language_code: string
          published_at: string | null
          published_chapter_count: number | null
          status: string
          updated_at: string
          visibility: string
        }
        Insert: {
          book_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          language_code: string
          published_at?: string | null
          published_chapter_count?: number | null
          status?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          language_code?: string
          published_at?: string | null
          published_chapter_count?: number | null
          status?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_versions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          book_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          audiobook_status: string | null
          author_id: string
          cover_image: string | null
          created_at: string
          description: string | null
          featured: boolean | null
          featured_rank: number | null
          featured_until: string | null
          id: string
          is_featured: boolean
          is_free: boolean | null
          is_translation: boolean
          language: string | null
          original_book_id: string | null
          original_language: string | null
          original_source: string | null
          original_url: string | null
          price_amount: number | null
          price_currency: string
          pricing_model: string
          print_on_demand_settings: Json
          published: boolean
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["book_status"]
          title: string
          trailer_status: string | null
          trailer_url: string | null
          translation_status: string | null
          updated_at: string
        }
        Insert: {
          audiobook_status?: string | null
          author_id: string
          cover_image?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean | null
          featured_rank?: number | null
          featured_until?: string | null
          id?: string
          is_featured?: boolean
          is_free?: boolean | null
          is_translation?: boolean
          language?: string | null
          original_book_id?: string | null
          original_language?: string | null
          original_source?: string | null
          original_url?: string | null
          price_amount?: number | null
          price_currency?: string
          pricing_model?: string
          print_on_demand_settings?: Json
          published?: boolean
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["book_status"]
          title: string
          trailer_status?: string | null
          trailer_url?: string | null
          translation_status?: string | null
          updated_at?: string
        }
        Update: {
          audiobook_status?: string | null
          author_id?: string
          cover_image?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean | null
          featured_rank?: number | null
          featured_until?: string | null
          id?: string
          is_featured?: boolean
          is_free?: boolean | null
          is_translation?: boolean
          language?: string | null
          original_book_id?: string | null
          original_language?: string | null
          original_source?: string | null
          original_url?: string | null
          price_amount?: number | null
          price_currency?: string
          pricing_model?: string
          print_on_demand_settings?: Json
          published?: boolean
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["book_status"]
          title?: string
          trailer_status?: string | null
          trailer_url?: string | null
          translation_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_original_book_id_fkey"
            columns: ["original_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_audio_cache: {
        Row: {
          audio_path: string
          book_version_id: string | null
          chapter_id: string
          content_hash: string
          created_at: string
          duration_seconds: number | null
          file_size_bytes: number | null
          id: string
          language: string
          model_path: string
          voice_id: string
        }
        Insert: {
          audio_path: string
          book_version_id?: string | null
          chapter_id: string
          content_hash: string
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          language: string
          model_path: string
          voice_id: string
        }
        Update: {
          audio_path?: string
          book_version_id?: string | null
          chapter_id?: string
          content_hash?: string
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          language?: string
          model_path?: string
          voice_id?: string
        }
        Relationships: []
      }
      chapters: {
        Row: {
          book_id: string
          book_version_id: string
          content: string
          content_hash: string | null
          created_at: string
          id: string
          order: number
          source_text: string | null
          title: string
          updated_at: string
        }
        Insert: {
          book_id: string
          book_version_id: string
          content?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          order: number
          source_text?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          book_version_id?: string
          content?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          order?: number
          source_text?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_book_version_id_fkey"
            columns: ["book_version_id"]
            isOneToOne: false
            referencedRelation: "book_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          book_id: string
          chapter_id: string | null
          created_at: string
          id: string
          parent_comment_id: string | null
        }
        Insert: {
          author_id: string
          body: string
          book_id: string
          chapter_id?: string | null
          created_at?: string
          id?: string
          parent_comment_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          book_id?: string
          chapter_id?: string | null
          created_at?: string
          id?: string
          parent_comment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      content_assets: {
        Row: {
          asset_url: string | null
          book_id: string
          book_snapshot: Json | null
          channel: string
          config: Json
          content_type: string
          created_at: string
          error: string | null
          id: string
          metadata: Json | null
          prompt_rendered: string | null
          prompt_template: string | null
          status: string
          text_content: Json | null
          updated_at: string
          user_id: string
          version: number
          visibility: string
        }
        Insert: {
          asset_url?: string | null
          book_id: string
          book_snapshot?: Json | null
          channel: string
          config?: Json
          content_type: string
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json | null
          prompt_rendered?: string | null
          prompt_template?: string | null
          status?: string
          text_content?: Json | null
          updated_at?: string
          user_id: string
          version?: number
          visibility?: string
        }
        Update: {
          asset_url?: string | null
          book_id?: string
          book_snapshot?: Json | null
          channel?: string
          config?: Json
          content_type?: string
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json | null
          prompt_rendered?: string | null
          prompt_template?: string | null
          status?: string
          text_content?: Json | null
          updated_at?: string
          user_id?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          accepted_at: string | null
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          created_by: string
          id: string
          last_message_at: string | null
          participant_one_id: string
          participant_two_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string | null
          participant_one_id: string
          participant_two_id: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string | null
          participant_one_id?: string
          participant_two_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_grants: {
        Row: {
          created_at: string
          delta: number
          id: string
          source: string
          source_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          source: string
          source_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          source?: string
          source_id?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_topups: {
        Row: {
          amount: number
          created_at: string
          credits_applied_at: string | null
          credits_delta: number
          currency: string
          id: string
          paid_at: string | null
          provider: string
          status: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits_applied_at?: string | null
          credits_delta: number
          currency: string
          id?: string
          paid_at?: string | null
          provider?: string
          status?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits_applied_at?: string | null
          credits_delta?: number
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: string
          status?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      curated_list_items: {
        Row: {
          book_id: string
          created_at: string
          id: string
          list_id: string
          rank: number
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          list_id: string
          rank?: number
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          list_id?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "curated_list_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curated_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "curated_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          language: string
          slug: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          language?: string
          slug: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          language?: string
          slug?: string
          title?: string
        }
        Relationships: []
      }
      dm_sender_rate_limits: {
        Row: {
          sender_id: string
          sent_count: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          sender_id: string
          sent_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          sender_id?: string
          sent_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount: number
          created_at: string
          credits_applied_at: string | null
          credits_delta: number
          currency: string
          id: string
          metadata: Json
          paid_at: string | null
          provider: string
          status: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits_applied_at?: string | null
          credits_delta?: number
          currency: string
          id?: string
          metadata?: Json
          paid_at?: string | null
          provider?: string
          status?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits_applied_at?: string | null
          credits_delta?: number
          currency?: string
          id?: string
          metadata?: Json
          paid_at?: string | null
          provider?: string
          status?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          book_id: string
          created_at: string
          id: string
          source: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          source: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          request_id: string | null
          status: string
          type: string
          url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          request_id?: string | null
          status?: string
          type: string
          url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          request_id?: string | null
          status?: string
          type?: string
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      genres: {
        Row: {
          created_at: string
          display_order: number
          icon: string | null
          id: string
          name: string
          name_en: string | null
          name_sv: string
          slug: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          name: string
          name_en?: string | null
          name_sv: string
          slug: string
        }
        Update: {
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          name?: string
          name_en?: string | null
          name_sv?: string
          slug?: string
        }
        Relationships: []
      }
      highlights: {
        Row: {
          book_id: string
          book_version_id: string
          chapter_id: string
          color: string
          created_at: string
          end_offset: number
          id: string
          note: string | null
          snippet: string
          start_offset: number
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          book_version_id: string
          chapter_id: string
          color?: string
          created_at?: string
          end_offset: number
          id?: string
          note?: string | null
          snippet: string
          start_offset: number
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          book_version_id?: string
          chapter_id?: string
          color?: string
          created_at?: string
          end_offset?: number
          id?: string
          note?: string | null
          snippet?: string
          start_offset?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_book_version_id_fkey"
            columns: ["book_version_id"]
            isOneToOne: false
            referencedRelation: "book_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_assets: {
        Row: {
          book_id: string
          channel: string
          content_type: string
          created_at: string
          id: string
          language: string
          metadata: Json | null
          text: string
        }
        Insert: {
          book_id: string
          channel: string
          content_type?: string
          created_at?: string
          id?: string
          language?: string
          metadata?: Json | null
          text: string
        }
        Update: {
          book_id?: string
          channel?: string
          content_type?: string
          created_at?: string
          id?: string
          language?: string
          metadata?: Json | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_assets_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          book_id: string
          caption: string | null
          channel: string
          created_at: string
          cta: string | null
          hashtags: string | null
          headline: string | null
          id: string
          language: string
          share_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          book_id: string
          caption?: string | null
          channel?: string
          created_at?: string
          cta?: string | null
          hashtags?: string | null
          headline?: string | null
          id?: string
          language?: string
          share_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          caption?: string | null
          channel?: string
          created_at?: string
          cta?: string | null
          hashtags?: string | null
          headline?: string | null
          id?: string
          language?: string
          share_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_caption_cache: {
        Row: {
          caption_text: string
          content_hash: string
          created_at: string
        }
        Insert: {
          caption_text: string
          content_hash: string
          created_at?: string
        }
        Update: {
          caption_text?: string
          content_hash?: string
          created_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          book_id: string | null
          created_at: string
          duration_seconds: number
          error: string | null
          estimated_cost_usd: number | null
          id: string
          input_json: Json
          metadata: Json
          output_url: string | null
          provider: Database["public"]["Enums"]["media_provider"]
          provider_request_id: string | null
          status: Database["public"]["Enums"]["media_asset_status"]
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          duration_seconds?: number
          error?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_json?: Json
          metadata?: Json
          output_url?: string | null
          provider?: Database["public"]["Enums"]["media_provider"]
          provider_request_id?: string | null
          status?: Database["public"]["Enums"]["media_asset_status"]
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string | null
          created_at?: string
          duration_seconds?: number
          error?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_json?: Json
          metadata?: Json
          output_url?: string | null
          provider?: Database["public"]["Enums"]["media_provider"]
          provider_request_id?: string | null
          status?: Database["public"]["Enums"]["media_asset_status"]
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      message_user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string
          created_at: string
          data: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body: string
          created_at?: string
          data?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string
          created_at?: string
          data?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offline_manifests: {
        Row: {
          book_id: string
          book_url: string | null
          book_version_id: string
          chapter_count: number
          chapter_hashes: Json
          chapter_urls: Json
          id: string
          language_code: string
          last_synced_at: string
          manifest_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          book_url?: string | null
          book_version_id: string
          chapter_count?: number
          chapter_hashes?: Json
          chapter_urls?: Json
          id?: string
          language_code: string
          last_synced_at?: string
          manifest_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          book_url?: string | null
          book_version_id?: string
          chapter_count?: number
          chapter_hashes?: Json
          chapter_urls?: Json
          id?: string
          language_code?: string
          last_synced_at?: string
          manifest_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_manifests_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_manifests_book_version_id_fkey"
            columns: ["book_version_id"]
            isOneToOne: false
            referencedRelation: "book_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          book_id: string
          country: string | null
          created_at: string
          currency: string
          id: string
          provider: string
          status: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          book_id: string
          country?: string | null
          created_at?: string
          currency: string
          id?: string
          provider: string
          status?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          book_id?: string
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          provider?: string
          status?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          id: string
          poll_id: string
          sort_order: number
          text: string
        }
        Insert: {
          id?: string
          poll_id: string
          sort_order?: number
          text: string
        }
        Update: {
          id?: string
          poll_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          author_id: string
          book_id: string | null
          closes_at: string | null
          created_at: string
          id: string
          is_active: boolean
          question: string
        }
        Insert: {
          author_id: string
          book_id?: string | null
          closes_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question: string
        }
        Update: {
          author_id?: string
          book_id?: string | null
          closes_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          cover_image: string | null
          created_at: string | null
          display_name: string | null
          is_public: boolean
          preferences: Json | null
          role: string | null
          social_links: Json | null
          updated_at: string | null
          user_id: string
          username: string | null
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cover_image?: string | null
          created_at?: string | null
          display_name?: string | null
          is_public?: boolean
          preferences?: Json | null
          role?: string | null
          social_links?: Json | null
          updated_at?: string | null
          user_id: string
          username?: string | null
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cover_image?: string | null
          created_at?: string | null
          display_name?: string | null
          is_public?: boolean
          preferences?: Json | null
          role?: string | null
          social_links?: Json | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      reader_book_signals: {
        Row: {
          book_id: string
          created_at: string
          id: string
          signal: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          signal: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          signal?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_book_signals_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_genre_preferences: {
        Row: {
          created_at: string
          genre_id: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          genre_id: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          genre_id?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "reader_genre_preferences_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_waitlist: {
        Row: {
          confirmation_email_error: string | null
          confirmation_email_last_attempt_at: string | null
          confirmation_email_sent_at: string | null
          confirmation_email_status: string
          created_at: string
          email: string
          follow_author: string | null
          id: string
          invited_at: string | null
          priority: number
          source: string | null
          status: string
          wave_key: string | null
        }
        Insert: {
          confirmation_email_error?: string | null
          confirmation_email_last_attempt_at?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string
          created_at?: string
          email: string
          follow_author?: string | null
          id?: string
          invited_at?: string | null
          priority?: number
          source?: string | null
          status?: string
          wave_key?: string | null
        }
        Update: {
          confirmation_email_error?: string | null
          confirmation_email_last_attempt_at?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string
          created_at?: string
          email?: string
          follow_author?: string | null
          id?: string
          invited_at?: string | null
          priority?: number
          source?: string | null
          status?: string
          wave_key?: string | null
        }
        Relationships: []
      }
      readings: {
        Row: {
          book_id: string
          chapter_id: string | null
          current_chapter: number
          id: string
          last_read_at: string
          progress_percent: number
          started_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_id?: string | null
          current_chapter?: number
          id: string
          last_read_at?: string
          progress_percent?: number
          started_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_id?: string | null
          current_chapter?: number
          id?: string
          last_read_at?: string
          progress_percent?: number
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "readings_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readings_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          batch_id: string
          book_id: string
          computed_at: string
          created_at: string
          id: string
          rank: number
          reason: string
          score: number
          user_id: string
        }
        Insert: {
          batch_id: string
          book_id: string
          computed_at?: string
          created_at?: string
          id?: string
          rank?: number
          reason?: string
          score?: number
          user_id: string
        }
        Update: {
          batch_id?: string
          book_id?: string
          computed_at?: string
          created_at?: string
          id?: string
          rank?: number
          reason?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_redemptions: {
        Row: {
          code: string
          created_at: string
          id: string
          redeemer_id: string
          referrer_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          redeemer_id: string
          referrer_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          redeemer_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          book_id: string
          book_version_id: string | null
          content: string | null
          created_at: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          book_version_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          book_version_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_book_version_id_fkey"
            columns: ["book_version_id"]
            isOneToOne: false
            referencedRelation: "book_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      shelf_books: {
        Row: {
          book_id: string
          created_at: string
          id: string
          section_id: string | null
          shelf_id: string
          sort_index: number
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          section_id?: string | null
          shelf_id: string
          sort_index?: number
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          section_id?: string | null
          shelf_id?: string
          sort_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shelf_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shelf_books_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "shelf_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shelf_books_shelf_id_fkey"
            columns: ["shelf_id"]
            isOneToOne: false
            referencedRelation: "shelves"
            referencedColumns: ["id"]
          },
        ]
      }
      shelf_sections: {
        Row: {
          created_at: string
          id: string
          name: string
          shelf_id: string
          sort_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          shelf_id: string
          sort_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          shelf_id?: string
          sort_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shelf_sections_shelf_id_fkey"
            columns: ["shelf_id"]
            isOneToOne: false
            referencedRelation: "shelves"
            referencedColumns: ["id"]
          },
        ]
      }
      shelves: {
        Row: {
          cover_gradient: string | null
          cover_type: string | null
          cover_url: string | null
          created_at: string | null
          id: string
          name: string
          sort_index: number
          subtitle: string | null
          typography: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cover_gradient?: string | null
          cover_type?: string | null
          cover_url?: string | null
          created_at?: string | null
          id?: string
          name: string
          sort_index?: number
          subtitle?: string | null
          typography?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cover_gradient?: string | null
          cover_type?: string | null
          cover_url?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sort_index?: number
          subtitle?: string | null
          typography?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          access_token_enc: string | null
          connected_at: string
          email_config_enc: string | null
          id: string
          platform: string
          platform_user_id: string | null
          platform_username: string | null
          refresh_token_enc: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          connected_at?: string
          email_config_enc?: string | null
          id?: string
          platform: string
          platform_user_id?: string | null
          platform_username?: string | null
          refresh_token_enc?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          connected_at?: string
          email_config_enc?: string | null
          id?: string
          platform?: string
          platform_user_id?: string | null
          platform_username?: string | null
          refresh_token_enc?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          received_at: string
          stripe_event_id: string
          type: string
        }
        Insert: {
          received_at?: string
          stripe_event_id: string
          type: string
        }
        Update: {
          received_at?: string
          stripe_event_id?: string
          type?: string
        }
        Relationships: []
      }
      translations: {
        Row: {
          created_at: string
          id: string
          original_book_id: string
          status: string
          target_language: string
          translated_book_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_book_id: string
          status?: string
          target_language: string
          translated_book_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          original_book_id?: string
          status?: string
          target_language?: string
          translated_book_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "translations_original_book_id_fkey"
            columns: ["original_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translations_translated_book_id_fkey"
            columns: ["translated_book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      tts_preview_jobs: {
        Row: {
          audio_path: string | null
          created_at: string
          error: string | null
          format: string
          id: string
          progress: number
          role: string
          seed: number | null
          speed: number | null
          status: string
          text: string
          updated_at: string
          user_id: string
          voice_id: string
        }
        Insert: {
          audio_path?: string | null
          created_at?: string
          error?: string | null
          format?: string
          id?: string
          progress?: number
          role?: string
          seed?: number | null
          speed?: number | null
          status?: string
          text: string
          updated_at?: string
          user_id: string
          voice_id?: string
        }
        Update: {
          audio_path?: string | null
          created_at?: string
          error?: string | null
          format?: string
          id?: string
          progress?: number
          role?: string
          seed?: number | null
          speed?: number | null
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
          voice_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          count: number
          day: string
          key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          active_days_30: number
          first_seen_at: string
          last_event_at: string
          last_seen_at: string
          sessions_30: number
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_days_30?: number
          first_seen_at?: string
          last_event_at?: string
          last_seen_at?: string
          sessions_30?: number
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_days_30?: number
          first_seen_at?: string
          last_event_at?: string
          last_seen_at?: string
          sessions_30?: number
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          token_balance: number
          user_id: string
        }
        Insert: {
          token_balance?: number
          user_id: string
        }
        Update: {
          token_balance?: number
          user_id?: string
        }
        Relationships: []
      }
      user_flags: {
        Row: {
          beta_enabled: boolean
          created_at: string
          user_id: string
        }
        Insert: {
          beta_enabled?: boolean
          created_at?: string
          user_id: string
        }
        Update: {
          beta_enabled?: boolean
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_usage_monthly: {
        Row: {
          created_at: string
          trailer_count_this_month: number
          updated_at: string
          usage_month: string
          user_id: string
        }
        Insert: {
          created_at?: string
          trailer_count_this_month?: number
          updated_at?: string
          usage_month: string
          user_id: string
        }
        Update: {
          created_at?: string
          trailer_count_this_month?: number
          updated_at?: string
          usage_month?: string
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          confirmation_email_error: string | null
          confirmation_email_last_attempt_at: string | null
          confirmation_email_sent_at: string | null
          confirmation_email_status: string
          created_at: string | null
          email: string
          id: string
          role: string | null
          source: string | null
        }
        Insert: {
          confirmation_email_error?: string | null
          confirmation_email_last_attempt_at?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string
          created_at?: string | null
          email: string
          id?: string
          role?: string | null
          source?: string | null
        }
        Update: {
          confirmation_email_error?: string | null
          confirmation_email_last_attempt_at?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string
          created_at?: string | null
          email?: string
          id?: string
          role?: string | null
          source?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          id: string
          received_at: string
        }
        Insert: {
          id: string
          received_at?: string
        }
        Update: {
          id?: string
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      job_status_view: {
        Row: {
          book_id: string | null
          created_at: string | null
          detail: Json | null
          error: string | null
          finished_at: string | null
          id: string | null
          kind: string | null
          language_code: string | null
          progress: number | null
          started_at: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      social_connections_safe: {
        Row: {
          connected_at: string | null
          id: string | null
          platform: string | null
          platform_username: string | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          id?: string | null
          platform?: string | null
          platform_username?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          id?: string | null
          platform?: string | null
          platform_username?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          is_pro: boolean | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view_book: {
        Args: { book_id: string; viewer_id: string }
        Returns: boolean
      }
      dm_consume_rate_limit: {
        Args: { p_max?: number; p_sender_id: string; p_window_seconds?: number }
        Returns: boolean
      }
      finalize_credit_topup_checkout_session: {
        Args: { p_stripe_session_id: string }
        Returns: boolean
      }
      finalize_donation_checkout_session: {
        Args: { p_stripe_session_id: string }
        Returns: boolean
      }
      finalize_order_checkout_session: {
        Args: { p_stripe_session_id: string }
        Returns: boolean
      }
      grant_user_credits_once: {
        Args: {
          p_delta: number
          p_source: string
          p_source_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      refresh_book_audiobook_status: {
        Args: { p_book_id: string }
        Returns: undefined
      }
    }
    Enums: {
      billing_provider: "stripe"
      billing_role: "reader" | "author"
      book_status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
      media_asset_status: "draft" | "generating" | "ready" | "failed"
      media_provider: "higgsfield"
      user_role: "reader" | "writer" | "ADMIN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      billing_provider: ["stripe"],
      billing_role: ["reader", "author"],
      book_status: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      media_asset_status: ["draft", "generating", "ready", "failed"],
      media_provider: ["higgsfield"],
      user_role: ["reader", "writer", "ADMIN"],
    },
  },
} as const
