create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.released_available_qty(p_product_code text)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(on_hand_qty - reserved_qty), 0)
  from inventory_batches
  where product_code = p_product_code
    and quality_status = 'RELEASED';
$$;

create or replace function public.has_app_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
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

create index dispatch_lines_dispatch_id_idx
  on public.dispatch_lines (dispatch_id);

create index dispatch_lines_product_code_idx
  on public.dispatch_lines (product_code);

create index dispatch_requests_customer_id_idx
  on public.dispatch_requests (customer_id);

create index inventory_reservations_inventory_batch_id_idx
  on public.inventory_reservations (inventory_batch_id);

drop policy if exists "authenticated insert dispatch requests" on public.dispatch_requests;
drop policy if exists "authenticated update dispatch requests" on public.dispatch_requests;
drop policy if exists "authenticated insert dispatch lines" on public.dispatch_lines;
drop policy if exists "authenticated update inventory batches" on public.inventory_batches;
drop policy if exists "authenticated insert reservations" on public.inventory_reservations;
drop policy if exists "authenticated update reservations" on public.inventory_reservations;
drop policy if exists "authenticated insert vehicles" on public.vehicle_assignments;
drop policy if exists "authenticated update vehicles" on public.vehicle_assignments;
drop policy if exists "authenticated insert documents" on public.dispatch_documents;
drop policy if exists "authenticated update documents" on public.dispatch_documents;
drop policy if exists "authenticated insert exceptions" on public.dispatch_exceptions;
drop policy if exists "authenticated update exceptions" on public.dispatch_exceptions;
drop policy if exists "authenticated insert audit" on public.audit_logs;

create policy "dispatch role insert dispatch requests"
on public.dispatch_requests for insert
to authenticated
with check (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "dispatch role update dispatch requests"
on public.dispatch_requests for update
to authenticated
using (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'WAREHOUSE_QUALITY'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'GATE_SECURITY'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
)
with check (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'WAREHOUSE_QUALITY'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'GATE_SECURITY'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "dispatch role insert dispatch lines"
on public.dispatch_lines for insert
to authenticated
with check (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "inventory role update inventory batches"
on public.inventory_batches for update
to authenticated
using (
  public.has_app_role(array[
    'WAREHOUSE_QUALITY'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
)
with check (
  public.has_app_role(array[
    'WAREHOUSE_QUALITY'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "approval role insert reservations"
on public.inventory_reservations for insert
to authenticated
with check (
  public.has_app_role(array[
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "approval role update reservations"
on public.inventory_reservations for update
to authenticated
using (
  public.has_app_role(array[
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
)
with check (
  public.has_app_role(array[
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "dispatch role insert vehicles"
on public.vehicle_assignments for insert
to authenticated
with check (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "dispatch gate role update vehicles"
on public.vehicle_assignments for update
to authenticated
using (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'GATE_SECURITY'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
)
with check (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'GATE_SECURITY'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "dispatch role insert documents"
on public.dispatch_documents for insert
to authenticated
with check (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "supervisor role update documents"
on public.dispatch_documents for update
to authenticated
using (
  public.has_app_role(array[
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
)
with check (
  public.has_app_role(array[
    'DISPATCH_SUPERVISOR'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "active role insert exceptions"
on public.dispatch_exceptions for insert
to authenticated
with check (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'WAREHOUSE_QUALITY'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'GATE_SECURITY'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "manager role update exceptions"
on public.dispatch_exceptions for update
to authenticated
using (
  public.has_app_role(array[
    'MANAGER_ADMIN'::public.app_role
  ])
)
with check (
  public.has_app_role(array[
    'MANAGER_ADMIN'::public.app_role
  ])
);

create policy "active role insert audit"
on public.audit_logs for insert
to authenticated
with check (
  public.has_app_role(array[
    'DISPATCH_CLERK'::public.app_role,
    'WAREHOUSE_QUALITY'::public.app_role,
    'DISPATCH_SUPERVISOR'::public.app_role,
    'GATE_SECURITY'::public.app_role,
    'MANAGER_ADMIN'::public.app_role
  ])
);
