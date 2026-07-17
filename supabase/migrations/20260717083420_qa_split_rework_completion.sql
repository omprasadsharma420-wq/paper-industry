do $$
begin
  if to_regprocedure('public.agra_execute_action_core(uuid,text,uuid,jsonb)') is null then
    alter function public.agra_execute_action(uuid, text, uuid, jsonb)
      rename to agra_execute_action_core;
  end if;
end
$$;

revoke all on function public.agra_execute_action_core(uuid, text, uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.agra_execute_action(
  p_request_id uuid,
  p_action text,
  p_order_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor public.agra_profiles%rowtype;
  v_order public.agra_orders%rowtype;
  v_rework public.agra_rework_records%rowtype;
  v_batch public.agra_inventory_batches%rowtype;
  v_existing jsonb;
  v_response jsonb;
  v_released numeric;
  v_damaged numeric;
  v_blocked numeric;
  v_total numeric;
  v_rejected numeric;
  v_new_status text;
  v_reinspection text;
  v_reservation_id uuid;
  v_error_code text;
  v_error_message text;
  v_quantity_changes jsonb;
begin
  if upper(btrim(coalesce(p_action, ''))) <> 'COMPLETE_REWORK'
     or not (coalesce(p_payload, '{}'::jsonb) ?| array['releasedQuantity', 'damagedQuantity', 'blockedQuantity']) then
    return public.agra_execute_action_core(p_request_id, p_action, p_order_id, p_payload);
  end if;

  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A unique request ID is required.';
  end if;
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Sign in is required.';
  end if;

  select * into v_actor
  from public.agra_profiles
  where user_id = (select auth.uid()) and active
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'No active Agra role is assigned to this account.';
  end if;

  select response into v_existing
  from public.agra_action_requests
  where request_id = p_request_id and organization_id = v_actor.organization_id;
  if found then
    return coalesce(v_existing, jsonb_build_object('ok', false, 'code', 'REQUEST_PROCESSING', 'message', 'This request is still processing.'))
      || jsonb_build_object('idempotentReplay', true);
  end if;

  insert into public.agra_action_requests
    (request_id, organization_id, actor_id, action, entity_type, entity_id)
  values
    (p_request_id, v_actor.organization_id, v_actor.user_id, 'COMPLETE_REWORK', 'ORDER', p_order_id);

  begin
    if v_actor.role <> all(array['INVENTORY_QUALITY', 'MANAGER_ADMIN']) then
      raise exception using errcode = '42501', message = 'Quality or manager access is required.';
    end if;

    select * into v_order
    from public.agra_orders
    where id = p_order_id and organization_id = v_actor.organization_id
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'Order was not found.';
    end if;
    if v_order.fulfillment_status <> 'REWORK_REQUIRED' then
      raise exception using errcode = 'P1002', message = 'This order is not waiting for rework.';
    end if;

    select * into v_rework
    from public.agra_rework_records
    where id = (p_payload->>'reworkId')::uuid
      and order_id = v_order.id
      and organization_id = v_actor.organization_id
    for update;
    if not found or v_rework.status = 'COMPLETED' then
      raise exception using errcode = 'P1002', message = 'This rework task is not open.';
    end if;

    v_released := coalesce(nullif(p_payload->>'releasedQuantity', '')::numeric, 0);
    v_damaged := coalesce(nullif(p_payload->>'damagedQuantity', '')::numeric, 0);
    v_blocked := coalesce(nullif(p_payload->>'blockedQuantity', '')::numeric, 0);
    v_total := v_released + v_damaged + v_blocked;
    v_rejected := v_damaged + v_blocked;
    if v_released < 0 or v_damaged < 0 or v_blocked < 0 or v_total <> v_rework.rework_quantity then
      raise exception using errcode = '22023', message = 'Released, damaged, and blocked quantities must be non-negative and equal the rework quantity.';
    end if;

    select * into v_batch
    from public.agra_inventory_batches
    where id = v_rework.inventory_batch_id and organization_id = v_actor.organization_id
    for update;
    if not found or v_batch.rework_quantity < v_total then
      raise exception using errcode = 'P1006', message = 'Rework inventory no longer matches this task.';
    end if;

    update public.agra_inventory_batches
    set rework_quantity = rework_quantity - v_total,
        released_quantity = released_quantity + v_released,
        damaged_quantity = damaged_quantity + v_damaged,
        blocked_quantity = blocked_quantity + v_blocked,
        reserved_quantity = reserved_quantity + v_released,
        qc_status = case
          when released_quantity + v_released > 0 then 'RELEASED'
          when v_blocked > 0 then 'BLOCKED'
          else 'DAMAGED'
        end,
        qc_release_date = case when v_released > 0 then current_date else qc_release_date end,
        updated_at = now()
    where id = v_batch.id;

    if v_released > 0 then
      select id into v_reservation_id
      from public.agra_inventory_reservations
      where order_id = v_order.id
        and order_item_id = v_rework.order_item_id
        and inventory_batch_id = v_batch.id
        and status = 'ACTIVE'
      order by reserved_at
      limit 1
      for update;
      if found then
        update public.agra_inventory_reservations
        set reserved_quantity = reserved_quantity + v_released
        where id = v_reservation_id;
      else
        insert into public.agra_inventory_reservations
          (organization_id, order_id, order_item_id, inventory_batch_id, reserved_quantity, unit, status, request_id)
        values
          (v_actor.organization_id, v_order.id, v_rework.order_item_id, v_batch.id, v_released, v_batch.unit, 'ACTIVE', p_request_id);
      end if;
    end if;

    v_reinspection := case when v_blocked > 0 then 'BLOCKED' when v_damaged > 0 then 'DAMAGED' else 'RELEASED' end;
    update public.agra_rework_records
    set rework_quantity = v_released,
        rejected_quantity = v_rejected,
        status = 'COMPLETED',
        completion_date = current_date,
        completion_note = nullif(btrim(p_payload->>'completionNote'), ''),
        reinspection_result = v_reinspection,
        updated_at = now()
    where id = v_rework.id;

    if v_rejected > 0 then
      v_new_status := 'BLOCKED';
      insert into public.agra_exceptions
        (organization_id, order_id, code, message, severity, status, affected_quantity, unit)
      values
        (v_actor.organization_id, v_order.id, 'REWORK_SHORTFALL',
         format('%s unit(s) were rejected after rework and require replacement.', v_rejected),
         'HIGH', 'OPEN', v_rejected, v_batch.unit);
    else
      v_new_status := 'AWAITING_QC';
    end if;

    update public.agra_orders
    set fulfillment_status = v_new_status, updated_at = now()
    where id = v_order.id;

    v_quantity_changes := jsonb_build_array(jsonb_build_object(
      'batchId', v_batch.id,
      'reworkCompleted', v_total,
      'releasedAndReserved', v_released,
      'damaged', v_damaged,
      'blocked', v_blocked
    ));
    v_response := jsonb_build_object(
      'ok', true,
      'code', 'REWORK_COMPLETED',
      'message', case when v_rejected > 0 then 'Rework recorded. Rejected units keep the order blocked.' else 'Rework completed and returned to quality check.' end,
      'entityId', v_order.id,
      'newStatus', v_new_status,
      'quantityChanges', v_quantity_changes
    );

    insert into public.agra_audit_events
      (organization_id, request_id, actor_id, actor_name, actor_role, action, entity_type, entity_id,
       previous_status, new_status, success, reason, quantity_changes, source)
    values
      (v_actor.organization_id, p_request_id, v_actor.user_id, v_actor.full_name, v_actor.role,
       'COMPLETE_REWORK', 'ORDER', v_order.id, v_order.fulfillment_status, v_new_status, true,
       v_response->>'message', v_quantity_changes, coalesce(nullif(p_payload->>'source', ''), 'N8N'));

    update public.agra_action_requests
    set status = 'SUCCEEDED', response = v_response, completed_at = now()
    where request_id = p_request_id;
    return v_response;

  exception when others then
    v_error_code := sqlstate;
    v_error_message := sqlerrm;
    v_response := jsonb_build_object(
      'ok', false,
      'code', case when v_error_code = '42501' then 'FORBIDDEN' when v_error_code = 'P1002' then 'INVALID_STATUS' when v_error_code = 'P1006' then 'INVENTORY_CONFLICT' else 'ACTION_FAILED' end,
      'message', v_error_message,
      'entityId', p_order_id
    );
    insert into public.agra_audit_events
      (organization_id, request_id, actor_id, actor_name, actor_role, action, entity_type, entity_id,
       previous_status, success, reason, source, error_code)
    values
      (v_actor.organization_id, p_request_id, v_actor.user_id, v_actor.full_name, v_actor.role,
       'COMPLETE_REWORK', 'ORDER', p_order_id, v_order.fulfillment_status, false, v_error_message,
       coalesce(nullif(p_payload->>'source', ''), 'N8N'), v_error_code);
    update public.agra_action_requests
    set status = 'FAILED', response = v_response, completed_at = now()
    where request_id = p_request_id;
    return v_response;
  end;
end
$$;

revoke all on function public.agra_execute_action(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.agra_execute_action(uuid, text, uuid, jsonb) to authenticated, service_role;
