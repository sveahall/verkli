-- ---------------------------------------------------------------------------
-- Sprint 0.5 — FK index gap fix (Task 1).
--
-- Background: 122 FK relationships were detected across 81 migrations; 34
-- columns lacked any index whose leading column was the FK column. This
-- migration adds them. Source: docs/db-audit.md.
--
-- All `CREATE INDEX IF NOT EXISTS` so this is replay-safe.
-- ---------------------------------------------------------------------------

-- High severity (hot read paths and large parent tables) ---------------------
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx
  ON public.analytics_events (user_id);

CREATE INDEX IF NOT EXISTS recommendations_book_id_idx
  ON public.recommendations (book_id);

CREATE INDEX IF NOT EXISTS readings_book_id_idx
  ON public.readings (book_id);

CREATE INDEX IF NOT EXISTS readings_chapter_id_idx
  ON public.readings (chapter_id);

CREATE INDEX IF NOT EXISTS reading_progress_user_id_idx
  ON public.reading_progress (user_id);

CREATE INDEX IF NOT EXISTS reading_progress_chapter_id_idx
  ON public.reading_progress (chapter_id);

CREATE INDEX IF NOT EXISTS reading_progress_book_version_id_idx
  ON public.reading_progress (book_version_id);

CREATE INDEX IF NOT EXISTS notifications_actor_id_idx
  ON public.notifications (actor_id);

CREATE INDEX IF NOT EXISTS highlights_book_id_idx
  ON public.highlights (book_id);

CREATE INDEX IF NOT EXISTS curated_list_items_book_id_idx
  ON public.curated_list_items (book_id);

-- Medium severity (moderate volume / background workers) --------------------
CREATE INDEX IF NOT EXISTS books_book_version_id_idx
  ON public.books (book_version_id);

CREATE INDEX IF NOT EXISTS book_clubs_current_book_id_idx
  ON public.book_clubs (current_book_id);

CREATE INDEX IF NOT EXISTS book_club_members_club_id_idx
  ON public.book_club_members (club_id);

CREATE INDEX IF NOT EXISTS book_club_messages_user_id_idx
  ON public.book_club_messages (user_id);

CREATE INDEX IF NOT EXISTS conversation_participants_conversation_id_idx
  ON public.conversation_participants (conversation_id);

CREATE INDEX IF NOT EXISTS conversations_created_by_idx
  ON public.conversations (created_by);

CREATE INDEX IF NOT EXISTS conversations_participant_two_id_idx
  ON public.conversations (participant_two_id);

CREATE INDEX IF NOT EXISTS conversations_blocked_by_idx
  ON public.conversations (blocked_by);

CREATE INDEX IF NOT EXISTS dm_sender_rate_limits_sender_id_idx
  ON public.dm_sender_rate_limits (sender_id);

CREATE INDEX IF NOT EXISTS message_user_blocks_blocker_id_idx
  ON public.message_user_blocks (blocker_id);

CREATE INDEX IF NOT EXISTS marketing_posts_media_asset_id_idx
  ON public.marketing_posts (media_asset_id);

CREATE INDEX IF NOT EXISTS poll_votes_poll_id_idx
  ON public.poll_votes (poll_id);

CREATE INDEX IF NOT EXISTS poll_votes_user_id_idx
  ON public.poll_votes (user_id);

CREATE INDEX IF NOT EXISTS reader_genre_preferences_genre_id_idx
  ON public.reader_genre_preferences (genre_id);

CREATE INDEX IF NOT EXISTS referral_codes_user_id_idx
  ON public.referral_codes (user_id);

CREATE INDEX IF NOT EXISTS referral_redemptions_referrer_id_idx
  ON public.referral_redemptions (referrer_id);

CREATE INDEX IF NOT EXISTS reviews_user_id_idx
  ON public.reviews (user_id);

CREATE INDEX IF NOT EXISTS user_credits_user_id_idx
  ON public.user_credits (user_id);

CREATE INDEX IF NOT EXISTS user_flags_user_id_idx
  ON public.user_flags (user_id);

CREATE INDEX IF NOT EXISTS user_usage_monthly_user_id_idx
  ON public.user_usage_monthly (user_id);

CREATE INDEX IF NOT EXISTS billing_accounts_user_id_idx
  ON public.billing_accounts (user_id);

CREATE INDEX IF NOT EXISTS author_subscription_plans_author_id_idx
  ON public.author_subscription_plans (author_id);

-- Low severity (admin-only) -------------------------------------------------
CREATE INDEX IF NOT EXISTS author_applications_user_id_idx
  ON public.author_applications (user_id);

CREATE INDEX IF NOT EXISTS content_reports_reviewed_by_user_id_idx
  ON public.content_reports (reviewed_by_user_id);
