create or replace function public.demo_record_n8n_feedback(p_dispatch_id uuid, p_n8n_result jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_n8n_result->'exceptions', '[]'::jsonb))
  loop
    insert into dispatch_exceptions (dispatch_id, code, message, severity, control_status)
    values (
      p_dispatch_id,
      coalesce(v_item->>'code', 'N8N_EXCEPTION'),
      coalesce(v_item->>'message', 'n8n blocked this workflow action.'),
      coalesce(nullif(v_item->>'severity', ''), 'HIGH')::exception_severity,
      coalesce(nullif(v_item->>'controlStatus', ''), 'BLOCKED')::control_status
    );
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_n8n_result->'warnings', '[]'::jsonb))
  loop
    insert into dispatch_exceptions (
      dispatch_id,
      code,
      message,
      severity,
      control_status,
      resolved_at
    )
    values (
      p_dispatch_id,
      coalesce(v_item->>'code', 'N8N_WARNING'),
      coalesce(v_item->>'message', 'n8n returned a workflow warning.'),
      'LOW',
      'WARNING',
      now()
    );
  end loop;
end;
$$;

revoke all on function public.demo_record_n8n_feedback(uuid, jsonb) from public;
