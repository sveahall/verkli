-- Account-wide AI preferences. Extends the memory switch into the full set of
-- controls the settings page exposes: a master off switch for authors who want
-- no AI at all, plus explicit tone/trait/profile preferences.
--
-- These live beside `enabled` (saved-preference memory) because they share one
-- row, one owner and one RLS policy. A separate table would mean two reads on
-- every AI request for data that is always wanted together.
--
-- Free-text columns are nullable and blank-normalised to NULL by the app: a
-- stored empty string and "not set" must not be two different states, because
-- the prompt builder decides what to include by presence.
alter table public.ai_memory_settings
  add column ai_enabled boolean not null default true,
  add column reply_style text not null default 'default'
    check (reply_style in ('default','concise','friendly','candid','encouraging')),
  add column warmth text not null default 'standard' check (warmth in ('less','standard','more')),
  add column enthusiasm text not null default 'standard' check (enthusiasm in ('less','standard','more')),
  add column structure text not null default 'standard' check (structure in ('less','standard','more')),
  add column emoji text not null default 'standard' check (emoji in ('less','standard','more')),
  add column match_writing_voice boolean not null default false,
  add column nickname text check (char_length(nickname) between 1 and 60),
  add column craft text check (char_length(craft) between 1 and 120),
  add column about text check (char_length(about) between 1 and 600),
  add column instructions text check (char_length(instructions) between 1 and 1500);

comment on table public.ai_memory_settings is 'Account-wide AI preferences: the master AI switch, saved-preference memory, and explicit tone/profile settings. Never inferred.';
comment on column public.ai_memory_settings.ai_enabled is 'False turns every AI surface off for this account. Enforced server-side on each AI generation route, not only in the UI.';
comment on column public.ai_memory_settings.enabled is 'Whether saved preferences (ai_memories) are sent to the assistant.';
comment on column public.ai_memory_settings.instructions is 'Author-authored standing requests. Untrusted user data: shaped into the user prompt, never the system prompt.';
