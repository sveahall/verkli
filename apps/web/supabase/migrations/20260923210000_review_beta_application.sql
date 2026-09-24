-- Reviewing a beta application decides two things in two tables: the decision
-- itself, and whether the applicant may sign up. Doing them as two statements
-- meant a failure between them left an accepted applicant blocked or a rejected
-- one invited, with the API still reporting success — and two admins deciding at
-- once could land on "rejected + invited", because each read the invitation
-- state before the other wrote it.
--
-- One function, one transaction, both rows locked in a fixed order.
create function public.review_beta_application(p_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  app public.beta_applications;
  wl public.waitlist;
  should_invite boolean;
  invitation text;
begin
  if p_status not in ('pending','accepted','rejected') then
    raise exception 'Unknown review status.' using errcode='22023';
  end if;

  -- Application first, always. A fixed lock order is what stops two concurrent
  -- reviews from deadlocking or interleaving into a contradictory state.
  select * into app from public.beta_applications where id = p_id for update;
  if not found then
    return jsonb_build_object('status','not_found');
  end if;

  update public.beta_applications
     set status = p_status,
         reviewed_at = case when p_status = 'pending' then null else clock_timestamp() end,
         updated_at = clock_timestamp(),
         review_note = coalesce(p_note, review_note)
   where id = app.id;

  if app.waitlist_id is null then
    return jsonb_build_object('status','ok','invitation','no_waitlist_row');
  end if;

  select * into wl from public.waitlist where id = app.waitlist_id for update;
  if not found then
    return jsonb_build_object('status','ok','invitation','no_waitlist_row');
  end if;

  should_invite := p_status = 'accepted';
  if (wl.beta_invited_at is not null) = should_invite then
    invitation := case when should_invite then 'already_invited' else 'not_invited' end;
  else
    update public.waitlist
       set beta_invited_at = case when should_invite then clock_timestamp() else null end
     where id = wl.id;
    invitation := case when should_invite then 'invited' else 'withdrawn' end;
  end if;

  return jsonb_build_object('status','ok','invitation',invitation);
end;
$$;

-- Authorization stays in the API route, which already requires an admin before
-- it reaches here. Only the service role may call this; granting it to
-- `authenticated` would let any signed-in user invite themselves.
revoke all on function public.review_beta_application(uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_beta_application(uuid,text,text) to service_role;

comment on function public.review_beta_application(uuid,text,text) is 'Records a beta application decision and the matching waitlist invitation in one transaction. Service role only: the admin check lives in the API route.';
