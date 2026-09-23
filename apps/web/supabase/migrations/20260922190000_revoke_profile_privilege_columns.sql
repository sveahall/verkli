-- profiles.role and profiles.demo_mode were UPDATE-granted to authenticated.
-- RLS only checks that the row is yours, so any signed-in user could
-- PATCH their own profile to role=author or demo_mode=true and open
-- paid generation. App writes go through the service role, which
-- bypasses grants. Nothing in the client updates these columns.
REVOKE UPDATE (role, demo_mode) ON public.profiles FROM authenticated, anon;
