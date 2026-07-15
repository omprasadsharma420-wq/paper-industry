create or replace function public.has_app_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from user_profiles
    where id = auth.uid()
      and active = true
      and role = any(allowed_roles)
  );
$$;
