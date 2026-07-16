create or replace function public.demo_action_allowed(p_actor_role public.app_role, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_action = 'SUBMIT_FOR_APPROVAL' then p_actor_role in ('DISPATCH_CLERK', 'MANAGER_ADMIN')
    when p_action = 'APPROVE_AND_RESERVE' then p_actor_role in ('DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    when p_action = 'REJECT' then p_actor_role in ('DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    when p_action = 'ASSIGN_VEHICLE' then p_actor_role in ('DISPATCH_CLERK', 'MANAGER_ADMIN')
    when p_action = 'MARK_VEHICLE_ARRIVED' then p_actor_role in ('GATE_SECURITY', 'MANAGER_ADMIN')
    when p_action = 'START_LOADING' then p_actor_role in ('WAREHOUSE_QUALITY', 'MANAGER_ADMIN')
    when p_action = 'COMPLETE_LOADING' then p_actor_role in ('WAREHOUSE_QUALITY', 'MANAGER_ADMIN')
    when p_action = 'VERIFY_WEIGHT' then p_actor_role in ('WAREHOUSE_QUALITY', 'MANAGER_ADMIN')
    when p_action = 'VERIFY_DOCUMENTS' then p_actor_role in ('DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    when p_action = 'CLEAR_GATE' then p_actor_role in ('GATE_SECURITY', 'MANAGER_ADMIN')
    when p_action = 'CONFIRM_EXIT' then p_actor_role in ('GATE_SECURITY', 'MANAGER_ADMIN')
    when p_action = 'RESOLVE_EXCEPTION' then p_actor_role = 'MANAGER_ADMIN'
    when p_action = 'CANCEL' then p_actor_role in ('DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    else false
  end;
$$;

revoke all on function public.demo_action_allowed(public.app_role, text) from public;
