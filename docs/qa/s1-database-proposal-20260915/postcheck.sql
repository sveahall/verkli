-- Read-only catalog evidence. Run on the target inside the change transaction,
-- then again through a fresh connection after an approved commit.
-- Catalog evidence alone does not prove Supabase HTTP or customer playback.
SELECT jsonb_build_object(
  'observed_at',now(),
  'server_version',current_setting('server_version'),
  'maintain_privileges',CASE WHEN current_setting('server_version_num')::int>=170000 THEN (
    SELECT jsonb_agg(jsonb_build_object('table',t,'role',r,
      'allowed',has_table_privilege(r,'public.'||t,'MAINTAIN')))
    FROM unnest(ARRAY['profiles','ai_jobs','audiobook_assets','chapter_audio_cache']) t
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
  ) ELSE NULL END,
  'table_privileges',(
    SELECT jsonb_agg(jsonb_build_object('table',t,'role',r,'privilege',p,
      'allowed',has_table_privilege(r,'public.'||t,p)))
    FROM unnest(ARRAY['profiles','ai_jobs','audiobook_assets','chapter_audio_cache']) t
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  ),
  'column_privileges',(
    SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'role',r,
      'insert',has_column_privilege(r,c.oid,a.attnum,'INSERT'),
      'update',has_column_privilege(r,c.oid,a.attnum,'UPDATE')))
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    CROSS JOIN unnest(ARRAY['anon','authenticated']) r
    WHERE c.oid IN ('public.profiles'::regclass,'public.ai_jobs'::regclass,
      'public.audiobook_assets'::regclass,'public.chapter_audio_cache'::regclass)
      AND a.attnum>0 AND NOT a.attisdropped
  ),
  'table_acl',(
    SELECT jsonb_agg(jsonb_build_object('table',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity))
    FROM pg_class c WHERE c.oid IN ('public.profiles'::regclass,'public.ai_jobs'::regclass,
      'public.audiobook_assets'::regclass,'public.chapter_audio_cache'::regclass,'storage.objects'::regclass)
  ),
  'policies',(
    SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p
    WHERE (schemaname='public' AND tablename IN ('profiles','ai_jobs','audiobook_assets','chapter_audio_cache'))
      OR (schemaname='storage' AND tablename='objects')
  ),
  'signup_function',pg_get_functiondef('public.handle_new_profile()'::regprocedure),
  'role_flags',(SELECT jsonb_agg(jsonb_build_object('role',rolname,'superuser',rolsuper,'bypass_rls',rolbypassrls))
    FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
  'inherited_roles',(SELECT jsonb_agg(jsonb_build_object('member',m.member::regrole,'inherits',m.roleid::regrole))
    FROM pg_auth_members m WHERE m.member IN ('anon'::regrole,'authenticated'::regrole))
);
