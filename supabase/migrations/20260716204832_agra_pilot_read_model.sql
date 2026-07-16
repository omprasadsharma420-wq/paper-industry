create or replace function public.agra_load_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_actor public.agra_profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Sign in is required.';
  end if;

  select * into v_actor from public.agra_profiles
  where user_id = (select auth.uid()) and active limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'No active Agra role is assigned to this account.';
  end if;

  return jsonb_build_object(
    'currentUser', to_jsonb(v_actor),
    'organization', (select to_jsonb(o) from public.agra_organizations o where o.id = v_actor.organization_id),
    'team', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.role, p.full_name)
      from public.agra_profiles p where p.organization_id = v_actor.organization_id
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.name)
      from public.agra_customers c where c.organization_id = v_actor.organization_id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'releasedStock', coalesce(s.released, 0),
          'reservedStock', coalesce(s.reserved, 0),
          'availableStock', coalesce(s.available, 0),
          'pendingStock', coalesce(s.pending, 0),
          'reworkStock', coalesce(s.rework, 0),
          'blockedStock', coalesce(s.blocked, 0),
          'damagedStock', coalesce(s.damaged, 0)
        ) order by p.name
      )
      from public.agra_products p
      left join lateral (
        select sum(b.released_quantity) released, sum(b.reserved_quantity) reserved,
               sum(b.available_quantity) available, sum(b.pending_quantity) pending,
               sum(b.rework_quantity) rework, sum(b.blocked_quantity) blocked,
               sum(b.damaged_quantity) damaged
        from public.agra_inventory_batches b where b.product_id = p.id
      ) s on true
      where p.organization_id = v_actor.organization_id
    ), '[]'::jsonb),
    'inventoryBatches', coalesce((
      select jsonb_agg(to_jsonb(b) || jsonb_build_object('product', to_jsonb(p)) order by b.production_date nulls last, b.batch_no)
      from public.agra_inventory_batches b join public.agra_products p on p.id = b.product_id
      where b.organization_id = v_actor.organization_id
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(
        to_jsonb(o) || jsonb_build_object(
          'customer', to_jsonb(c),
          'items', coalesce((
            select jsonb_agg(to_jsonb(oi) || jsonb_build_object('product', to_jsonb(pr)) order by pr.name)
            from public.agra_order_items oi join public.agra_products pr on pr.id = oi.product_id
            where oi.order_id = o.id
          ), '[]'::jsonb),
          'reservations', coalesce((
            select jsonb_agg(to_jsonb(r) || jsonb_build_object('batch', to_jsonb(b)) order by r.reserved_at)
            from public.agra_inventory_reservations r join public.agra_inventory_batches b on b.id = r.inventory_batch_id
            where r.order_id = o.id
          ), '[]'::jsonb),
          'qualityChecks', coalesce((select jsonb_agg(to_jsonb(q) order by q.inspected_at) from public.agra_qc_inspections q where q.order_id = o.id), '[]'::jsonb),
          'reworkRecords', coalesce((select jsonb_agg(to_jsonb(rw) order by rw.created_at) from public.agra_rework_records rw where rw.order_id = o.id), '[]'::jsonb),
          'picks', coalesce((select jsonb_agg(to_jsonb(pk) order by pk.started_at) from public.agra_pick_records pk where pk.order_id = o.id), '[]'::jsonb),
          'packing', (select to_jsonb(pa) || jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(pi)) from public.agra_packing_items pi where pi.packing_record_id = pa.id), '[]'::jsonb)) from public.agra_packing_records pa where pa.order_id = o.id),
          'documents', coalesce((select jsonb_agg(to_jsonb(d) order by d.document_type) from public.agra_documents d where d.order_id = o.id), '[]'::jsonb),
          'handover', (select to_jsonb(h) from public.agra_handovers h where h.order_id = o.id),
          'exceptions', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.agra_exceptions e where e.order_id = o.id), '[]'::jsonb)
        ) order by o.created_at desc
      )
      from public.agra_orders o join public.agra_customers c on c.id = o.customer_id
      where o.organization_id = v_actor.organization_id
    ), '[]'::jsonb),
    'exceptions', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from public.agra_exceptions e where e.organization_id = v_actor.organization_id
    ), '[]'::jsonb),
    'auditEvents', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (select * from public.agra_audit_events where organization_id = v_actor.organization_id order by created_at desc limit 250) a
    ), '[]'::jsonb),
    'systemEvents', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from (select * from public.agra_system_events where organization_id = v_actor.organization_id order by created_at desc limit 50) s
    ), '[]'::jsonb),
    'demoState', (select to_jsonb(ds) from public.agra_demo_state ds where ds.organization_id = v_actor.organization_id),
    'loadedAt', now()
  );
end
$$;

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
    'applicationVersion', '2026.07.17-agra-pilot.1',
    'databaseMigration', '20260716203441_agra_operations_pilot',
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

create or replace function public.agra_initialize_demo()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role is required.';
  end if;
  perform private.agra_seed_demo_data();
end
$$;

revoke all on function public.agra_load_workspace() from public, anon;
revoke all on function public.agra_system_health() from public, anon;
revoke all on function public.agra_initialize_demo() from public, anon, authenticated;
grant execute on function public.agra_load_workspace() to authenticated, service_role;
grant execute on function public.agra_system_health() to authenticated, service_role;
grant execute on function public.agra_initialize_demo() to service_role;

grant all on table
  public.agra_organizations,
  public.agra_profiles,
  public.agra_customers,
  public.agra_products,
  public.agra_orders,
  public.agra_order_items,
  public.agra_inventory_batches,
  public.agra_inventory_reservations,
  public.agra_qc_inspections,
  public.agra_rework_records,
  public.agra_pick_records,
  public.agra_packing_records,
  public.agra_packing_items,
  public.agra_documents,
  public.agra_handovers,
  public.agra_exceptions,
  public.agra_action_requests,
  public.agra_audit_events,
  public.agra_system_events,
  public.agra_demo_state
to service_role;
grant usage, select on sequence public.agra_order_number_seq to service_role;

revoke update, delete, truncate on public.agra_audit_events from authenticated;
