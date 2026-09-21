-- Explicit author preferences and private text-only conversations. No inferred memories.
create table public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  edition_id uuid references public.book_versions(id) on delete cascade,
  tool text not null check (tool in ('edit','cover','audiobook','translate','market','pricing','publish','review')),
  title text not null default 'New conversation' check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index ai_threads_scope_idx on public.ai_threads(owner_id,book_id,edition_id,tool,updated_at desc);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  state text not null default 'pending' check (state in ('pending','completed','interrupted','deleted')),
  check ((state='deleted' and content='') or (state<>'deleted' and char_length(content) between 1 and 8000)),
  reply_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique(owner_id,request_id,role)
);
create index ai_messages_thread_idx on public.ai_messages(thread_id,created_at,id);
create table public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  edition_id uuid references public.book_versions(id) on delete cascade,
  scope text not null check (scope in ('author','book','edition')),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope='author' and book_id is null and edition_id is null)
    or (scope='book' and book_id is not null and edition_id is null)
    or (scope='edition' and book_id is not null and edition_id is not null))
);
create index ai_memories_scope_idx on public.ai_memories(owner_id,book_id,edition_id);
create table public.ai_memory_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create function public.ai_owns_scope(p_owner_id uuid,p_book_id uuid,p_edition_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select p_owner_id=(select auth.uid()) and (
    (p_book_id is null and p_edition_id is null) or exists (
      select 1 from public.books b where b.id=p_book_id and b.author_id=p_owner_id and b.deleted_at is null
        and (p_edition_id is null or exists(select 1 from public.book_versions v where v.id=p_edition_id and v.book_id=b.id))
    )
  );
$$;
revoke all on function public.ai_owns_scope(uuid,uuid,uuid) from public,anon;
grant execute on function public.ai_owns_scope(uuid,uuid,uuid) to authenticated;

alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_memories enable row level security;
alter table public.ai_memory_settings enable row level security;
revoke all on public.ai_threads,public.ai_messages,public.ai_memories,public.ai_memory_settings from public,anon,authenticated;
grant select,insert,update,delete on public.ai_threads,public.ai_messages,public.ai_memories,public.ai_memory_settings to authenticated;
-- Thread deletion uses the content-erasing RPC below. Keep request tombstones
-- against direct REST deletion; parent account/book/edition cascades still purge.
revoke delete on public.ai_threads,public.ai_messages from authenticated;
grant all on public.ai_threads,public.ai_messages,public.ai_memories,public.ai_memory_settings to service_role;
create policy ai_threads_owner on public.ai_threads for all to authenticated
  using(public.ai_owns_scope(owner_id,book_id,edition_id)) with check(public.ai_owns_scope(owner_id,book_id,edition_id));
create policy ai_memories_owner on public.ai_memories for all to authenticated
  using(public.ai_owns_scope(owner_id,book_id,edition_id)) with check(public.ai_owns_scope(owner_id,book_id,edition_id));
create policy ai_messages_owner on public.ai_messages for all to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.ai_threads t where t.id=thread_id and t.owner_id=ai_messages.owner_id))
  with check(owner_id=(select auth.uid()) and exists(select 1 from public.ai_threads t where t.id=thread_id and t.owner_id=ai_messages.owner_id and t.deleted_at is null));
create policy ai_memory_settings_owner on public.ai_memory_settings for all to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create function public.ai_protect_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.owner_id is distinct from old.owner_id then raise exception 'AI data owner cannot change.' using errcode='23514'; end if;
  if tg_table_name in ('ai_threads','ai_memories') then
    if new.id is distinct from old.id or new.book_id is distinct from old.book_id or new.edition_id is distinct from old.edition_id then
      raise exception 'AI data scope cannot change.' using errcode='23514';
    end if;
    if tg_table_name='ai_threads' then
      if new.tool is distinct from old.tool or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
        raise exception 'AI conversation identity cannot change or be restored.' using errcode='23514';
      end if;
    elsif new.scope is distinct from old.scope then raise exception 'AI memory scope cannot change.' using errcode='23514'; end if;
    new.created_at:=old.created_at;
  elsif tg_table_name='ai_messages' then
    if new.id is distinct from old.id or new.thread_id is distinct from old.thread_id or new.request_id is distinct from old.request_id or new.role is distinct from old.role or new.reply_id is distinct from old.reply_id then
      raise exception 'AI message identity cannot change.' using errcode='23514';
    end if;
    new.created_at:=old.created_at;
    return new;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
create trigger ai_threads_identity before update on public.ai_threads for each row execute function public.ai_protect_identity();
create trigger ai_memories_identity before update on public.ai_memories for each row execute function public.ai_protect_identity();
create trigger ai_messages_identity before update on public.ai_messages for each row execute function public.ai_protect_identity();
create trigger ai_settings_identity before update on public.ai_memory_settings for each row execute function public.ai_protect_identity();

-- Serialize preference creation per account and cap every applicable author/book/edition context.
create function public.ai_limit_memories() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 601));
  if exists (
    with items as (
      select m.book_id,m.edition_id,m.scope from public.ai_memories m where m.owner_id=new.owner_id
      union all select new.book_id,new.edition_id,new.scope
    )
    select 1 from items contexts where (
      select count(*) from items i where i.scope='author' or (i.book_id=contexts.book_id and (i.scope='book' or i.edition_id=contexts.edition_id))
    )>24
  ) then raise exception 'At most 24 memories may apply to one conversation.' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger ai_memories_limit before insert on public.ai_memories for each row execute function public.ai_limit_memories();

-- Reservations live in user messages. Only a new reservation may call a provider.
-- The account/request lock also serializes requests without an existing thread.
create function public.ai_reserve_request(p_book_id uuid,p_tool text,p_request_id uuid,p_content text,p_edition_id uuid default null,p_thread_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.ai_threads; m public.ai_messages; a public.ai_messages; tid uuid;
begin
  if not public.ai_owns_scope(auth.uid(),p_book_id,p_edition_id) then raise exception 'AI conversation scope is unavailable.' using errcode='42501'; end if;
  if char_length(btrim(p_content)) not between 1 and 2000 then raise exception 'AI request must contain 1 to 2000 characters.' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text, 602));
  select * into m from public.ai_messages where owner_id=auth.uid() and request_id=p_request_id and role='user';
  if found then
    if m.state='deleted' then return jsonb_build_object('status','deleted'); end if;
    if m.state='pending' and m.created_at < clock_timestamp()-interval '2 minutes' then
      update public.ai_messages set state='interrupted' where id=m.id and state='pending' returning * into m;
      -- A concurrent completion/deletion may have changed the row while the
      -- conditional UPDATE waited. Read its committed result instead of downgrading it.
      if not found then
        select * into m from public.ai_messages where owner_id=auth.uid() and request_id=p_request_id and role='user';
        if not found then return jsonb_build_object('status','deleted'); end if;
      end if;
    end if;
    if m.state='deleted' then return jsonb_build_object('status','deleted'); end if;
    if m.state='interrupted' then return jsonb_build_object('status','interrupted'); end if;
    select * into t from public.ai_threads where id=m.thread_id and deleted_at is null;
    if not found or t.book_id<>p_book_id or t.edition_id is distinct from p_edition_id or t.tool<>p_tool or (p_thread_id is not null and t.id<>p_thread_id) then
      return jsonb_build_object('status','conflict');
    end if;
    if m.content<>p_content then return jsonb_build_object('status','conflict'); end if;
    select * into a from public.ai_messages where owner_id=auth.uid() and request_id=p_request_id and role='assistant';
    if found then return jsonb_build_object('status','completed','threadId',t.id,'replyId',a.id,'content',a.content); end if;
    return jsonb_build_object('status','pending','threadId',t.id,'replyId',m.reply_id);
  end if;
  tid:=coalesce(p_thread_id,p_request_id);
  if p_thread_id is null then
    insert into public.ai_threads(id,owner_id,book_id,edition_id,tool,title)
      values(tid,auth.uid(),p_book_id,p_edition_id,p_tool,left(p_content,80)) on conflict(id) do nothing;
  end if;
  select * into t from public.ai_threads where id=tid for update;
  if not found or t.deleted_at is not null or t.book_id<>p_book_id or t.edition_id is distinct from p_edition_id or t.tool<>p_tool then
    return jsonb_build_object('status','not_found');
  end if;
  -- An expired request is never sent again. A new explicit message may proceed.
  update public.ai_messages set state='interrupted' where thread_id=t.id and state='pending' and created_at<clock_timestamp()-interval '2 minutes';
  -- One in-flight turn per conversation keeps history ordered under concurrent tabs.
  if exists(select 1 from public.ai_messages where thread_id=t.id and state='pending') then
    return jsonb_build_object('status','pending','threadId',t.id);
  end if;
  insert into public.ai_messages(thread_id,owner_id,request_id,role,content)
    values(t.id,auth.uid(),p_request_id,'user',p_content) returning * into m;
  update public.ai_threads set updated_at=clock_timestamp(),title=case when title='New conversation' then left(p_content,80) else title end where id=t.id;
  return jsonb_build_object('status','reserved','threadId',t.id,'replyId',m.reply_id);
end;
$$;

create function public.ai_complete_request(p_thread_id uuid,p_request_id uuid,p_content text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.ai_threads; m public.ai_messages; a public.ai_messages;
begin
  select * into t from public.ai_threads where id=p_thread_id for update;
  if not found or t.deleted_at is not null then return jsonb_build_object('status','deleted'); end if;
  select * into m from public.ai_messages where thread_id=t.id and owner_id=auth.uid() and request_id=p_request_id and role='user' for update;
  if not found then return jsonb_build_object('status','deleted'); end if;
  if m.state='interrupted' then return jsonb_build_object('status','interrupted'); end if;
  if m.state='completed' then
    select * into a from public.ai_messages where thread_id=t.id and request_id=p_request_id and role='assistant';
    return jsonb_build_object('status','completed','replyId',a.id);
  end if;
  insert into public.ai_messages(id,thread_id,owner_id,request_id,role,content,state)
    values(m.reply_id,t.id,auth.uid(),p_request_id,'assistant',p_content,'completed');
  update public.ai_messages set state='completed' where id=m.id;
  update public.ai_threads set updated_at=clock_timestamp() where id=t.id;
  return jsonb_build_object('status','completed','replyId',m.reply_id);
end;
$$;

create function public.ai_delete_thread(p_book_id uuid,p_thread_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t public.ai_threads;
begin
  select * into t from public.ai_threads where id=p_thread_id and book_id=p_book_id for update;
  if not found then return false; end if;
  if t.deleted_at is not null then return true; end if;
  -- Retain content-free request identifiers: omitted-thread retries must not create
  -- a new conversation from an old request. Account/book/edition cascades purge them.
  update public.ai_messages set content='',state='deleted' where thread_id=t.id;
  update public.ai_threads set deleted_at=coalesce(deleted_at,clock_timestamp()),title='Deleted conversation' where id=t.id;
  return true;
end;
$$;
revoke all on function public.ai_protect_identity(),public.ai_limit_memories(),public.ai_reserve_request(uuid,text,uuid,text,uuid,uuid),public.ai_complete_request(uuid,uuid,text),public.ai_delete_thread(uuid,uuid) from public,anon;
grant execute on function public.ai_reserve_request(uuid,text,uuid,text,uuid,uuid),public.ai_complete_request(uuid,uuid,text),public.ai_delete_thread(uuid,uuid) to authenticated;

comment on table public.ai_memories is 'Private, explicitly authored preferences. Never inferred from conversations.';
comment on table public.ai_messages is 'Private text-only history. Proposal text is never proof that an action ran.';
