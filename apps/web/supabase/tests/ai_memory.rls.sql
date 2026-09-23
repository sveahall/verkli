\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.ai_memories(id,owner_id,scope,content) values ('30000000-0000-4000-8000-000000000001',auth.uid(),'author','Prefer short sentences.');
do $$begin
  begin
    insert into public.ai_memories(owner_id,book_id,scope,content) values(auth.uid(),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','book','Leak');
    raise exception 'FAIL cross-owner book accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.ai_memories(owner_id,book_id,edition_id,scope,content) values(auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','edition','Wrong edition');
    raise exception 'FAIL cross-book edition accepted';
  exception when insufficient_privilege then null; end;
end$$;
do $$declare r jsonb; begin
  r := public.ai_reserve_request(p_book_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_tool=>'edit',p_request_id=>'70000000-0000-4000-8000-000000000001',p_content=>'Without optional scope');
  if r->>'status' <> 'reserved' then raise exception 'FAIL optional scope defaults: %',r; end if;
end$$;
select public.ai_reserve_request(p_book_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_edition_id=>'dddddddd-dddd-4ddd-8ddd-dddddddddddd',p_tool=>'edit',p_thread_id=>null,p_request_id=>'50000000-0000-4000-8000-000000000001',p_content=>'Help me.');
do $$declare r jsonb; begin
  r := public.ai_reserve_request(p_book_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_edition_id=>'dddddddd-dddd-4ddd-8ddd-dddddddddddd',p_tool=>'edit',p_thread_id=>'50000000-0000-4000-8000-000000000001',p_request_id=>'50000000-0000-4000-8000-000000000001',p_content=>'Help me.');
  if r->>'status' <> 'pending' then raise exception 'FAIL duplicate request not pending: %',r; end if;
  r := public.ai_complete_request('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Try a stronger opening.');
  if r->>'status' <> 'completed' then raise exception 'FAIL completion: %',r; end if;
  r := public.ai_reserve_request(p_book_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_edition_id=>'dddddddd-dddd-4ddd-8ddd-dddddddddddd',p_tool=>'edit',p_thread_id=>'50000000-0000-4000-8000-000000000001',p_request_id=>'50000000-0000-4000-8000-000000000001',p_content=>'Help me.');
  if r->>'status' <> 'completed' or r->>'content' <> 'Try a stronger opening.' then raise exception 'FAIL duplicate completed: %',r; end if;
  begin
    update public.ai_threads set book_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' where id='50000000-0000-4000-8000-000000000001';
    raise exception 'FAIL thread book can move';
  exception when check_violation then null; end;
  begin
    update public.ai_memories set owner_id='22222222-2222-4222-8222-222222222222' where id='30000000-0000-4000-8000-000000000001';
    raise exception 'FAIL owner can move';
  exception when check_violation then null; end;
end$$;
select public.ai_reserve_request(p_book_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_edition_id=>'dddddddd-dddd-4ddd-8ddd-dddddddddddd',p_tool=>'edit',p_thread_id=>'50000000-0000-4000-8000-000000000001',p_request_id=>'50000000-0000-4000-8000-000000000002',p_content=>'In flight.');
select public.ai_delete_thread('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','50000000-0000-4000-8000-000000000001');
select public.ai_delete_thread('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','50000000-0000-4000-8000-000000000001');
do $$declare r jsonb; begin
  r := public.ai_complete_request('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','Must not resurrect.');
  if r->>'status' <> 'deleted' then raise exception 'FAIL deleted thread resurrects: %',r; end if;
  if exists(select 1 from public.ai_messages where thread_id='50000000-0000-4000-8000-000000000001' and content<>'') then raise exception 'FAIL deleted content remains'; end if;
  r := public.ai_reserve_request(p_book_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_edition_id=>'dddddddd-dddd-4ddd-8ddd-dddddddddddd',p_tool=>'edit',p_thread_id=>null,p_request_id=>'50000000-0000-4000-8000-000000000002',p_content=>'In flight.');
  if r->>'status' <> 'deleted' then raise exception 'FAIL omitted-thread retry resurrects: %',r; end if;
end$$;
-- A crashed provider cannot block a thread forever or be retried implicitly.
insert into public.ai_threads(id,owner_id,book_id,tool) values ('60000000-0000-4000-8000-000000000001',auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','edit');
insert into public.ai_messages(thread_id,owner_id,request_id,role,content,created_at)
  values('60000000-0000-4000-8000-000000000001',auth.uid(),'60000000-0000-4000-8000-000000000002','user','Expired',now()-interval '3 minutes');
do $$declare r jsonb; begin
  r:=public.ai_reserve_request(p_book_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_edition_id=>null,p_tool=>'edit',p_thread_id=>'60000000-0000-4000-8000-000000000001',p_request_id=>'60000000-0000-4000-8000-000000000002',p_content=>'Expired');
  if r->>'status'<>'interrupted' then raise exception 'FAIL expired request can rerun: %',r; end if;
  r:=public.ai_reserve_request(p_book_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_edition_id=>null,p_tool=>'edit',p_thread_id=>'60000000-0000-4000-8000-000000000001',p_request_id=>'60000000-0000-4000-8000-000000000003',p_content=>'New explicit request');
  if r->>'status'<>'reserved' then raise exception 'FAIL expired request blocks new request: %',r; end if;
  r:=public.ai_complete_request('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','Late response');
  if r->>'status'<>'interrupted' then raise exception 'FAIL expired response restored: %',r; end if;
end$$;
-- The 25th applicable preference fails even when written outside the API.
insert into public.ai_memories(owner_id,scope,content) select auth.uid(),'author','Preference '||i from generate_series(1,23) i;
do $$begin
  begin
    insert into public.ai_memories(owner_id,scope,content) values(auth.uid(),'author','Number 25');
    raise exception 'FAIL 25 memories accepted';
  exception when check_violation then null; end;
end$$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$begin
  if exists(select 1 from public.ai_memories) or exists(select 1 from public.ai_threads) or exists(select 1 from public.ai_messages) then raise exception 'FAIL private AI data visible cross-owner'; end if;
  begin
    insert into public.ai_messages(owner_id,thread_id,request_id,role,content) values(auth.uid(),'50000000-0000-4000-8000-000000000001',gen_random_uuid(),'user','Inject');
    raise exception 'FAIL message inserted into other owner thread';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
do $$begin
  if has_table_privilege('authenticated','public.ai_messages','DELETE') or has_table_privilege('authenticated','public.ai_threads','DELETE') then raise exception 'FAIL content-free idempotency tombstones can be erased'; end if;
  if has_table_privilege('anon','public.ai_memories','SELECT') then raise exception 'FAIL anonymous access'; end if;
end$$;
-- Book and edition cascades retain author-wide preferences; account removal purges all.
delete from public.book_versions where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
do $$begin
  if exists(select 1 from public.ai_threads where edition_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'FAIL edition cascade'; end if;
end$$;
delete from public.books where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$begin
  if exists(select 1 from public.ai_threads where book_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'FAIL book cascade'; end if;
  if (select count(*) from public.ai_memories)<>24 then raise exception 'FAIL author preferences lost on book deletion'; end if;
end$$;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
do $$begin
  if exists(select 1 from public.ai_memories) or exists(select 1 from public.ai_messages) or exists(select 1 from public.ai_threads) or exists(select 1 from public.ai_memory_settings) then raise exception 'FAIL account cascade'; end if;
end$$;
rollback;
\echo 'AI memory RLS assertions passed'
