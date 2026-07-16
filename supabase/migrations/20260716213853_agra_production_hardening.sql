-- Remove duplicate indexes while retaining the equivalent named indexes.
drop index if exists public.agra_audit_org_created_idx;
drop index if exists public.agra_orders_org_fulfillment_idx;

-- Cover foreign keys used by joins and parent-row deletes. Existing composite
-- indexes whose first column differs do not cover these access paths.
create index if not exists agra_action_requests_actor_fk_idx
  on public.agra_action_requests (actor_id);
create index if not exists agra_documents_org_fk_idx
  on public.agra_documents (organization_id);
create index if not exists agra_documents_verified_by_fk_idx
  on public.agra_documents (verified_by);
create index if not exists agra_exceptions_resolved_by_fk_idx
  on public.agra_exceptions (resolved_by);
create index if not exists agra_handovers_confirmed_by_fk_idx
  on public.agra_handovers (confirmed_by);
create index if not exists agra_handovers_org_fk_idx
  on public.agra_handovers (organization_id);
create index if not exists agra_inventory_batches_product_fk_idx
  on public.agra_inventory_batches (product_id);
create index if not exists agra_inventory_reservations_org_fk_idx
  on public.agra_inventory_reservations (organization_id);
create index if not exists agra_order_items_org_fk_idx
  on public.agra_order_items (organization_id);
create index if not exists agra_orders_approved_by_fk_idx
  on public.agra_orders (approved_by);
create index if not exists agra_orders_cancelled_by_fk_idx
  on public.agra_orders (cancelled_by);
create index if not exists agra_orders_created_by_fk_idx
  on public.agra_orders (created_by);
create index if not exists agra_orders_customer_fk_idx
  on public.agra_orders (customer_id);
create index if not exists agra_packing_items_org_fk_idx
  on public.agra_packing_items (organization_id);
create index if not exists agra_packing_records_org_fk_idx
  on public.agra_packing_records (organization_id);
create index if not exists agra_packing_records_packer_fk_idx
  on public.agra_packing_records (packer_id);
create index if not exists agra_pick_records_org_fk_idx
  on public.agra_pick_records (organization_id);
create index if not exists agra_pick_records_picker_fk_idx
  on public.agra_pick_records (picker_id);
create index if not exists agra_qc_inspections_inspected_by_fk_idx
  on public.agra_qc_inspections (inspected_by);
create index if not exists agra_qc_inspections_org_fk_idx
  on public.agra_qc_inspections (organization_id);
create index if not exists agra_rework_records_responsible_user_fk_idx
  on public.agra_rework_records (responsible_user_id);

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
    'applicationVersion', '2026.07.17-agra-pilot.3',
    'databaseMigration', '20260716213853_agra_production_hardening',
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

revoke all on function public.agra_system_health() from public, anon;
grant execute on function public.agra_system_health() to authenticated, service_role;
