create or replace function public.agra_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_actor public.agra_profiles%rowtype;
  v_invalid_inventory integer;
  v_reservation_mismatches integer;
begin
  select * into v_actor from public.agra_profiles
  where user_id = (select auth.uid()) and active limit 1;
  if not found or v_actor.role <> 'MANAGER_ADMIN' then
    raise exception using errcode = '42501', message = 'Manager access is required.';
  end if;

  select count(*) into v_invalid_inventory
  from public.agra_inventory_batches
  where organization_id = v_actor.organization_id
    and (physical_quantity < 0 or released_quantity < 0 or reserved_quantity < 0
      or available_quantity < 0 or rework_quantity < 0 or blocked_quantity < 0 or damaged_quantity < 0);

  select count(*) into v_reservation_mismatches
  from public.agra_inventory_batches b
  left join lateral (
    select coalesce(sum(r.reserved_quantity), 0) active_reserved
    from public.agra_inventory_reservations r
    where r.inventory_batch_id = b.id and r.status = 'ACTIVE'
  ) x on true
  where b.organization_id = v_actor.organization_id and b.reserved_quantity <> x.active_reserved;

  return jsonb_build_object(
    'ok', v_invalid_inventory = 0 and v_reservation_mismatches = 0,
    'supabase', 'CONNECTED',
    'applicationVersion', '2026.07.17-agra-pilot.2',
    'databaseMigration', '20260716210500_agra_automation_and_indexes',
    'environment', 'DEMO',
    'invalidInventoryRows', v_invalid_inventory,
    'reservationMismatches', v_reservation_mismatches,
    'authUserCount', (select count(*) from public.agra_profiles where organization_id = v_actor.organization_id and active),
    'lastSuccessfulAction', (select to_jsonb(a) from public.agra_audit_events a where a.organization_id = v_actor.organization_id and a.success order by a.created_at desc limit 1),
    'lastFailedAction', (select to_jsonb(a) from public.agra_audit_events a where a.organization_id = v_actor.organization_id and not a.success order by a.created_at desc limit 1),
    'demoState', (select to_jsonb(ds) from public.agra_demo_state ds where ds.organization_id = v_actor.organization_id),
    'checkedAt', now()
  );
end
$$;

create or replace function public.agra_run_monitor(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor public.agra_profiles%rowtype;
  v_kind text := upper(btrim(coalesce(p_kind, '')));
  v_items jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_message text;
  v_result jsonb;
begin
  select * into v_actor from public.agra_profiles
  where user_id = (select auth.uid()) and active limit 1;

  if not found or v_actor.role not in ('MANAGER_ADMIN', 'OPERATIONS_SUPERVISOR') then
    raise exception using errcode = '42501', message = 'Supervisor or manager access is required.';
  end if;

  if v_kind = 'LOW_STOCK' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.available_quantity, x.sku), '[]'::jsonb)
      into v_items
    from (
      select p.id as product_id, p.sku, p.name, p.primary_unit as unit,
        p.minimum_stock_level,
        coalesce(sum(b.available_quantity) filter (where b.qc_status = 'RELEASED'), 0) as available_quantity
      from public.agra_products p
      left join public.agra_inventory_batches b
        on b.product_id = p.id and b.organization_id = p.organization_id
      where p.organization_id = v_actor.organization_id and p.active
      group by p.id
      having coalesce(sum(b.available_quantity) filter (where b.qc_status = 'RELEASED'), 0) < p.minimum_stock_level
    ) x;
    v_message := format('%s product(s) are below minimum stock.', jsonb_array_length(v_items));
  elsif v_kind = 'OPEN_REWORK' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.due_date nulls last, x.order_no), '[]'::jsonb)
      into v_items
    from (
      select r.id, o.order_no, p.sku, p.name as product_name, r.defect_type,
        r.rework_quantity, oi.unit, r.status, r.due_date
      from public.agra_rework_records r
      join public.agra_orders o on o.id = r.order_id
      join public.agra_order_items oi on oi.id = r.order_item_id
      join public.agra_products p on p.id = oi.product_id
      where r.organization_id = v_actor.organization_id and r.status in ('OPEN', 'IN_PROGRESS')
    ) x;
    v_message := format('%s rework task(s) remain open.', jsonb_array_length(v_items));
  elsif v_kind = 'OPEN_EXCEPTIONS' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.order_no), '[]'::jsonb)
      into v_items
    from (
      select e.id, o.order_no, e.code, e.message, e.severity, e.created_at
      from public.agra_exceptions e
      left join public.agra_orders o on o.id = e.order_id
      where e.organization_id = v_actor.organization_id and e.status = 'OPEN'
    ) x;
    v_message := format('%s operational exception(s) need attention.', jsonb_array_length(v_items));
  elsif v_kind = 'DAILY_SUMMARY' then
    select jsonb_build_object(
      'openOrders', count(*) filter (where order_status = 'CONFIRMED' and fulfillment_status <> 'DISPATCHED'),
      'awaitingApproval', count(*) filter (where fulfillment_status = 'AWAITING_APPROVAL'),
      'inPicking', count(*) filter (where fulfillment_status = 'PICKING'),
      'awaitingQc', count(*) filter (where fulfillment_status = 'AWAITING_QC'),
      'inPacking', count(*) filter (where fulfillment_status = 'PACKING'),
      'readyForHandover', count(*) filter (where fulfillment_status = 'READY_FOR_HANDOVER'),
      'dispatchedToday', count(*) filter (where dispatched_at::date = current_date)
    ) into v_summary
    from public.agra_orders
    where organization_id = v_actor.organization_id;

    v_summary := v_summary || jsonb_build_object(
      'openExceptions', (select count(*) from public.agra_exceptions where organization_id = v_actor.organization_id and status = 'OPEN'),
      'openRework', (select count(*) from public.agra_rework_records where organization_id = v_actor.organization_id and status in ('OPEN', 'IN_PROGRESS')),
      'generatedFor', current_date
    );
    v_message := 'Daily operations summary generated.';
  else
    raise exception using errcode = '22023', message = 'Unknown monitor kind.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'kind', v_kind,
    'message', v_message,
    'items', v_items,
    'summary', v_summary,
    'generatedAt', now()
  );

  insert into public.agra_system_events (organization_id, source, event_type, success, message, metadata)
  values (v_actor.organization_id, 'N8N', v_kind, true, v_message, v_result);

  return v_result;
exception when others then
  if v_actor.organization_id is not null then
    insert into public.agra_system_events (organization_id, source, event_type, success, message, metadata)
    values (v_actor.organization_id, 'N8N', coalesce(nullif(v_kind, ''), 'MONITOR_ERROR'), false, sqlerrm,
      jsonb_build_object('sqlState', sqlstate, 'generatedAt', now()));
  end if;
  raise;
end
$$;

revoke all on function public.agra_run_monitor(text) from public, anon;
grant execute on function public.agra_run_monitor(text) to authenticated, service_role;

create index if not exists agra_profiles_org_idx on public.agra_profiles (organization_id);
create index if not exists agra_customers_org_idx on public.agra_customers (organization_id);
create index if not exists agra_products_org_idx on public.agra_products (organization_id);
create index if not exists agra_orders_org_customer_idx on public.agra_orders (organization_id, customer_id);
create index if not exists agra_orders_org_fulfillment_idx on public.agra_orders (organization_id, fulfillment_status, requested_dispatch_date);
create index if not exists agra_order_items_order_idx on public.agra_order_items (order_id);
create index if not exists agra_order_items_product_idx on public.agra_order_items (product_id);
create index if not exists agra_inventory_batches_product_idx on public.agra_inventory_batches (organization_id, product_id, qc_status, production_date);
create index if not exists agra_reservations_order_idx on public.agra_inventory_reservations (order_id, status);
create index if not exists agra_reservations_batch_idx on public.agra_inventory_reservations (inventory_batch_id, status);
create index if not exists agra_qc_order_idx on public.agra_qc_inspections (order_id, inspected_at desc);
create index if not exists agra_qc_item_idx on public.agra_qc_inspections (order_item_id);
create index if not exists agra_qc_batch_idx on public.agra_qc_inspections (inventory_batch_id);
create index if not exists agra_rework_order_status_idx on public.agra_rework_records (order_id, status, due_date);
create index if not exists agra_rework_item_idx on public.agra_rework_records (order_item_id);
create index if not exists agra_rework_batch_idx on public.agra_rework_records (inventory_batch_id);
create index if not exists agra_picks_order_idx on public.agra_pick_records (order_id);
create index if not exists agra_picks_item_idx on public.agra_pick_records (order_item_id);
create index if not exists agra_picks_batch_idx on public.agra_pick_records (inventory_batch_id);
create index if not exists agra_packing_items_record_idx on public.agra_packing_items (packing_record_id);
create index if not exists agra_packing_items_item_idx on public.agra_packing_items (order_item_id);
create index if not exists agra_documents_order_idx on public.agra_documents (order_id, status);
create index if not exists agra_exceptions_org_status_idx on public.agra_exceptions (organization_id, status, severity, created_at);
create index if not exists agra_exceptions_order_idx on public.agra_exceptions (order_id);
create index if not exists agra_action_requests_org_actor_idx on public.agra_action_requests (organization_id, actor_id, created_at desc);
create index if not exists agra_audit_org_created_idx on public.agra_audit_events (organization_id, created_at desc);
create index if not exists agra_audit_request_idx on public.agra_audit_events (request_id);
create index if not exists agra_system_events_org_created_idx on public.agra_system_events (organization_id, created_at desc);
