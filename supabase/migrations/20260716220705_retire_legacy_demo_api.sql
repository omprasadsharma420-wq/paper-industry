-- The Agra pilot uses authenticated agra_* functions. Keep the legacy objects
-- for rollback, but remove their anonymous and signed-in API surface.
revoke all on function public.demo_load_state() from public, anon, authenticated;
revoke all on function public.demo_reset_state() from public, anon, authenticated;
revoke all on function public.demo_create_dispatch(
  text,
  public.app_role,
  text,
  public.customer_type,
  text,
  public.dispatch_priority,
  text,
  numeric,
  date
) from public, anon, authenticated;
revoke all on function public.demo_apply_workflow_action(
  uuid,
  text,
  public.app_role,
  text,
  jsonb,
  jsonb
) from public, anon, authenticated;
