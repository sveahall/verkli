-- Settings live on separate pages, so each form saves one slice of
-- `profiles.preferences`. The app did that as read-modify-write, which is the
-- textbook lost update: two sections saved moments apart both read the same
-- JSON, and the second write put back the first one's old values. Both reported
-- success, and the author saw a setting they had just changed revert.
--
-- The merge has to happen inside one statement. `||` alone will not do: it
-- merges only the top level, so patching {"notifications":{"email":true}} would
-- drop a sibling like "sms". Hence a recursive merge.
create function public.jsonb_merge_deep(a jsonb, b jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; key text;
begin
  -- Anything that is not two objects: the patch wins outright.
  if a is null or jsonb_typeof(a) <> 'object' or b is null or jsonb_typeof(b) <> 'object' then
    return b;
  end if;
  result := a;
  for key in select jsonb_object_keys(b) loop
    result := jsonb_set(result, array[key], public.jsonb_merge_deep(a -> key, b -> key), true);
  end loop;
  return result;
end;
$$;

create function public.merge_profile_preferences(p_user_id uuid, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare merged jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Preference patch must be a JSON object.' using errcode='22023';
  end if;

  insert into public.profiles (user_id, preferences)
  values (p_user_id, p_patch)
  on conflict (user_id) do update
    -- coalesce: a profile whose preferences are NULL must merge, not vanish.
    set preferences = public.jsonb_merge_deep(coalesce(public.profiles.preferences, '{}'::jsonb), excluded.preferences)
  returning preferences into merged;

  return merged;
end;
$$;

-- RLS still applies (security invoker), so a caller can only merge into a row
-- their own policies already let them write.
revoke all on function public.jsonb_merge_deep(jsonb,jsonb), public.merge_profile_preferences(uuid,jsonb) from public,anon;
grant execute on function public.jsonb_merge_deep(jsonb,jsonb), public.merge_profile_preferences(uuid,jsonb) to authenticated,service_role;

comment on function public.merge_profile_preferences(uuid,jsonb) is 'Recursive merge of a preference slice in one statement. Replaces read-modify-write, which lost updates when two settings pages saved at once.';
