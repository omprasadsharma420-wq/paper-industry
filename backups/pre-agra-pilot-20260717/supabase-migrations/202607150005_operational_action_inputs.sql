create or replace function public.demo_apply_workflow_action(
  p_dispatch_id uuid,
  p_actor_name text,
  p_actor_role public.app_role,
  p_action text,
  p_action_input jsonb,
  p_n8n_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_vehicle jsonb := coalesce(p_action_input->'vehicle', '{}'::jsonb);
  v_document jsonb;
  v_note text := nullif(trim(p_action_input->>'note'), '');
  v_ok boolean := coalesce((p_n8n_result->>'ok')::boolean, true);
begin
  if p_action = 'VERIFY_WEIGHT' and p_action_input ? 'actualWeightKg' then
    update dispatch_requests
    set actual_weight_kg = nullif(p_action_input->>'actualWeightKg', '')::numeric
    where id = p_dispatch_id;
  end if;

  if p_action = 'VERIFY_DOCUMENTS' and jsonb_typeof(p_action_input->'documents') = 'array' then
    for v_document in
      select value from jsonb_array_elements(p_action_input->'documents')
    loop
      update dispatch_documents
      set
        present = coalesce((v_document->>'present')::boolean, false),
        verified = false,
        verified_by_name = null,
        verified_at = null
      where dispatch_id = p_dispatch_id
        and document_type = (v_document->>'type')::public.document_type;
    end loop;
  end if;

  v_result := public.demo_apply_workflow_action(
    p_dispatch_id,
    p_actor_name,
    p_actor_role,
    p_action,
    p_n8n_result
  );

  if p_action = 'ASSIGN_VEHICLE' and v_ok then
    insert into vehicle_assignments (
      dispatch_id,
      vehicle_no,
      transporter,
      driver_name,
      driver_phone,
      expected_arrival
    )
    values (
      p_dispatch_id,
      nullif(trim(v_vehicle->>'vehicleNo'), ''),
      nullif(trim(v_vehicle->>'transporter'), ''),
      nullif(trim(v_vehicle->>'driverName'), ''),
      nullif(trim(v_vehicle->>'driverPhone'), ''),
      nullif(v_vehicle->>'expectedArrival', '')::timestamptz
    )
    on conflict (dispatch_id)
    do update set
      vehicle_no = excluded.vehicle_no,
      transporter = excluded.transporter,
      driver_name = excluded.driver_name,
      driver_phone = excluded.driver_phone,
      expected_arrival = excluded.expected_arrival;
  end if;

  if v_note is not null and p_action in ('REJECT', 'RESOLVE_EXCEPTION', 'CANCEL') then
    update audit_logs
    set note = v_note
    where id = (
      select id
      from audit_logs
      where dispatch_id = p_dispatch_id
        and action = p_action
      order by created_at desc
      limit 1
    );

    v_result := jsonb_set(v_result, '{message}', to_jsonb(v_note));
  end if;

  return jsonb_set(v_result, '{state}', public.demo_load_state());
end;
$$;

revoke all on function public.demo_apply_workflow_action(
  uuid,
  text,
  public.app_role,
  text,
  jsonb,
  jsonb
) from public;

grant execute on function public.demo_apply_workflow_action(
  uuid,
  text,
  public.app_role,
  text,
  jsonb,
  jsonb
) to anon, authenticated;
