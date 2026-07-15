revoke all on function public.demo_seed_dispatch_control() from public, anon, authenticated;
revoke all on function public.demo_action_allowed(public.app_role, text) from public, anon, authenticated;
revoke all on function public.demo_record_n8n_feedback(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.demo_refresh_control_status(uuid) from public, anon, authenticated;
