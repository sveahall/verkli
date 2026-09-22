-- Private print layouts belong to an edition, independently of publication.
-- Artwork paths are immutable and scoped to owner/book/edition/side.
create table if not exists public.book_production_drafts (
  version_id uuid primary key references public.book_versions(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 600000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists book_production_drafts_book_idx on public.book_production_drafts(book_id);
create index if not exists book_production_drafts_owner_idx on public.book_production_drafts(owner_id);

create or replace function public.owns_book_production_edition(p_book_id uuid, p_version_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.books b
    join public.book_versions v on v.book_id = b.id
    where b.id = p_book_id and v.id = p_version_id
      and b.author_id = (select auth.uid()) and b.deleted_at is null
  );
$$;
revoke all on function public.owns_book_production_edition(uuid, uuid) from public, anon;
grant execute on function public.owns_book_production_edition(uuid, uuid) to authenticated;

alter table public.book_production_drafts enable row level security;
revoke all on public.book_production_drafts from public, anon, authenticated;
grant select, insert, update on public.book_production_drafts to authenticated;
grant all on public.book_production_drafts to service_role;

drop policy if exists production_drafts_select_owner on public.book_production_drafts;
create policy production_drafts_select_owner on public.book_production_drafts
  for select to authenticated
  using (owner_id = (select auth.uid()) and public.owns_book_production_edition(book_id, version_id));

drop policy if exists production_drafts_insert_owner on public.book_production_drafts;
create policy production_drafts_insert_owner on public.book_production_drafts
  for insert to authenticated
  with check (revision = 1 and owner_id = (select auth.uid()) and public.owns_book_production_edition(book_id, version_id));

drop policy if exists production_drafts_update_owner on public.book_production_drafts;
create policy production_drafts_update_owner on public.book_production_drafts
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.owns_book_production_edition(book_id, version_id))
  with check (owner_id = (select auth.uid()) and public.owns_book_production_edition(book_id, version_id));

create or replace function public.protect_book_production_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.book_id is distinct from old.book_id
    or new.version_id is distinct from old.version_id
    or new.owner_id is distinct from old.owner_id then
    raise exception 'Book production draft identity cannot change.' using errcode = '23514';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'Book production revision must advance by one.' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.protect_book_production_revision() from public, anon;
drop trigger if exists book_production_revision on public.book_production_drafts;
create trigger book_production_revision before update on public.book_production_drafts
  for each row execute function public.protect_book_production_revision();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('print-artwork', 'print-artwork', false, 20971520, array['image/jpeg', 'image/png']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.owns_book_production_artwork(object_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(front|back)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
    and split_part(object_name, '/', 1) = (select auth.uid())::text
    and exists (
      select 1 from public.books b
      join public.book_versions v on v.book_id = b.id
      where b.id::text = split_part(object_name, '/', 2)
        and v.id::text = split_part(object_name, '/', 3)
        and b.author_id = (select auth.uid()) and b.deleted_at is null
    );
$$;
revoke all on function public.owns_book_production_artwork(text) from public, anon;
grant execute on function public.owns_book_production_artwork(text) to authenticated;

drop policy if exists print_artwork_select_owner on storage.objects;
create policy print_artwork_select_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'print-artwork' and public.owns_book_production_artwork(name));

drop policy if exists print_artwork_insert_owner on storage.objects;
create policy print_artwork_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'print-artwork' and public.owns_book_production_artwork(name));

-- Restrictive guards also protect this bucket if another permissive storage
-- policy is broadened later. CASE leaves every other bucket unchanged.
drop policy if exists print_artwork_select_scope_guard on storage.objects;
create policy print_artwork_select_scope_guard on storage.objects
  as restrictive for select to authenticated
  using (case when bucket_id = 'print-artwork' then public.owns_book_production_artwork(name) else true end);

drop policy if exists print_artwork_insert_scope_guard on storage.objects;
create policy print_artwork_insert_scope_guard on storage.objects
  as restrictive for insert to authenticated
  with check (case when bucket_id = 'print-artwork' then public.owns_book_production_artwork(name) else true end);

-- Anonymous access does not invoke an ownership function whose EXECUTE grant
-- is intentionally restricted to signed-in users.
drop policy if exists print_artwork_select_anon_guard on storage.objects;
create policy print_artwork_select_anon_guard on storage.objects
  as restrictive for select to anon
  using (bucket_id <> 'print-artwork');

drop policy if exists print_artwork_insert_anon_guard on storage.objects;
create policy print_artwork_insert_anon_guard on storage.objects
  as restrictive for insert to anon
  with check (bucket_id <> 'print-artwork');

drop policy if exists print_artwork_update_immutable_guard on storage.objects;
create policy print_artwork_update_immutable_guard on storage.objects
  as restrictive for update to public
  using (bucket_id <> 'print-artwork')
  with check (bucket_id <> 'print-artwork');

drop policy if exists print_artwork_delete_immutable_guard on storage.objects;
create policy print_artwork_delete_immutable_guard on storage.objects
  as restrictive for delete to public
  using (bucket_id <> 'print-artwork');

comment on table public.book_production_drafts is
  'Private per-edition print settings and additional matter. Server saves use optimistic revision comparison; direct access is owner-only.';
