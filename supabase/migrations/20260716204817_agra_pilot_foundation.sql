create schema if not exists private;

create table public.agra_organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_demo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.agra_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in (
    'SALES_ORDER_COORDINATOR',
    'INVENTORY_QUALITY',
    'PACKING_DISPATCH',
    'OPERATIONS_SUPERVISOR',
    'MANAGER_ADMIN'
  )),
  department text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agra_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  customer_code text not null,
  name text not null,
  customer_type text not null default 'BUSINESS' check (customer_type in ('BUSINESS', 'RETAIL', 'INSTITUTION', 'EXPORT')),
  contact_name text,
  phone text,
  email text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, customer_code)
);

create table public.agra_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  sku text not null,
  name text not null,
  category text not null check (category in (
    'HANDMADE_PAPER_SHEET', 'HANDCRAFTED_DIARY', 'NOTEBOOK', 'PAPER_BAG',
    'PACKAGING_BOX', 'GIFT_BOX', 'DECORATIVE_PAPER_ITEM', 'PAPER_FRAME',
    'CUSTOM_PRODUCT', 'OTHER'
  )),
  description text,
  size text,
  length_cm numeric(12,2),
  width_cm numeric(12,2),
  height_cm numeric(12,2),
  colour text,
  design text,
  material text,
  paper_type text,
  pages integer check (pages is null or pages > 0),
  packaging_specification text,
  custom_branding_capable boolean not null default false,
  primary_unit text not null check (primary_unit in ('PIECE', 'SHEET', 'PACK', 'BUNDLE', 'CARTON', 'KG', 'DOZEN')),
  standard_package_quantity numeric(14,3) not null default 1 check (standard_package_quantity > 0),
  minimum_stock_level numeric(14,3) not null default 0 check (minimum_stock_level >= 0),
  estimated_unit_cost numeric(14,2) check (estimated_unit_cost is null or estimated_unit_cost >= 0),
  standard_selling_price numeric(14,2) check (standard_selling_price is null or standard_selling_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create sequence if not exists public.agra_order_number_seq start 1001;

create table public.agra_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_no text not null,
  customer_id uuid not null references public.agra_customers(id),
  customer_order_reference text,
  order_status text not null default 'DRAFT' check (order_status in ('DRAFT', 'CONFIRMED', 'CANCELLED', 'CLOSED')),
  fulfillment_status text not null default 'DRAFT' check (fulfillment_status in (
    'DRAFT', 'AWAITING_STOCK_CHECK', 'AWAITING_APPROVAL', 'APPROVED',
    'AWAITING_PRODUCTION', 'PICKING', 'AWAITING_QC', 'REWORK_REQUIRED',
    'PACKING', 'READY_FOR_HANDOVER', 'HANDED_OVER', 'DISPATCHED',
    'PARTIALLY_DISPATCHED', 'BLOCKED', 'CANCELLED'
  )),
  fulfillment_source text not null default 'FINISHED_STOCK' check (fulfillment_source in ('FINISHED_STOCK', 'PRODUCTION_REQUIRED')),
  payment_status text not null default 'NOT_TRACKED' check (payment_status = 'NOT_TRACKED'),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  order_date date not null default current_date,
  requested_dispatch_date date not null,
  delivery_deadline date,
  is_custom_order boolean not null default false,
  customization_summary text,
  requested_colour text,
  requested_dimensions text,
  logo_or_branding_required boolean not null default false,
  print_text text,
  customer_specification_confirmed boolean not null default false,
  sample_approval_required boolean not null default false,
  sample_approved boolean not null default false,
  sample_approval_date date,
  special_packaging_instructions text,
  specification_revision integer not null default 1 check (specification_revision > 0),
  production_reference text,
  expected_production_completion date,
  production_completed_quantity numeric(14,3),
  production_completion_notes text,
  notes text,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancellation_reason text,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_no)
);

create unique index agra_orders_customer_reference_unique
  on public.agra_orders (organization_id, customer_id, lower(customer_order_reference))
  where customer_order_reference is not null and btrim(customer_order_reference) <> '';

create table public.agra_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid not null references public.agra_orders(id) on delete cascade,
  product_id uuid not null references public.agra_products(id),
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  approved_quantity numeric(14,3) not null default 0 check (approved_quantity >= 0),
  unit text not null check (unit in ('PIECE', 'SHEET', 'PACK', 'BUNDLE', 'CARTON', 'KG', 'DOZEN')),
  customization jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table public.agra_inventory_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  product_id uuid not null references public.agra_products(id),
  batch_no text not null,
  production_date date,
  qc_status text not null check (qc_status in ('PENDING_QC', 'RELEASED', 'REWORK_REQUIRED', 'BLOCKED', 'DAMAGED')),
  qc_release_date date,
  storage_location text not null,
  shelf_reference text,
  physical_quantity numeric(14,3) not null check (physical_quantity >= 0),
  pending_quantity numeric(14,3) not null default 0 check (pending_quantity >= 0),
  released_quantity numeric(14,3) not null default 0 check (released_quantity >= 0),
  reserved_quantity numeric(14,3) not null default 0 check (reserved_quantity >= 0),
  available_quantity numeric(14,3) generated always as (released_quantity - reserved_quantity) stored,
  rework_quantity numeric(14,3) not null default 0 check (rework_quantity >= 0),
  blocked_quantity numeric(14,3) not null default 0 check (blocked_quantity >= 0),
  damaged_quantity numeric(14,3) not null default 0 check (damaged_quantity >= 0),
  unit text not null check (unit in ('PIECE', 'SHEET', 'PACK', 'BUNDLE', 'CARTON', 'KG', 'DOZEN')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, batch_no),
  check (reserved_quantity <= released_quantity),
  check (physical_quantity = pending_quantity + released_quantity + rework_quantity + blocked_quantity + damaged_quantity)
);

create table public.agra_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid not null references public.agra_orders(id) on delete cascade,
  order_item_id uuid not null references public.agra_order_items(id) on delete cascade,
  inventory_batch_id uuid not null references public.agra_inventory_batches(id),
  reserved_quantity numeric(14,3) not null check (reserved_quantity >= 0),
  unit text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RELEASED', 'DEDUCTED')),
  request_id uuid not null,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  deducted_at timestamptz,
  unique (order_item_id, inventory_batch_id)
);

create table public.agra_qc_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid not null references public.agra_orders(id) on delete cascade,
  order_item_id uuid not null references public.agra_order_items(id) on delete cascade,
  inventory_batch_id uuid references public.agra_inventory_batches(id),
  product_category text not null,
  inspected_quantity numeric(14,3) not null check (inspected_quantity > 0),
  passed_quantity numeric(14,3) not null default 0 check (passed_quantity >= 0),
  rework_quantity numeric(14,3) not null default 0 check (rework_quantity >= 0),
  blocked_quantity numeric(14,3) not null default 0 check (blocked_quantity >= 0),
  damaged_quantity numeric(14,3) not null default 0 check (damaged_quantity >= 0),
  result text not null check (result in ('PASSED', 'REWORK_REQUIRED', 'BLOCKED', 'DAMAGED')),
  checklist jsonb not null default '{}'::jsonb,
  defect_type text,
  defect_description text,
  inspected_by uuid not null references auth.users(id),
  inspected_at timestamptz not null default now(),
  notes text,
  check (inspected_quantity = passed_quantity + rework_quantity + blocked_quantity + damaged_quantity)
);

create table public.agra_rework_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid not null references public.agra_orders(id) on delete cascade,
  order_item_id uuid not null references public.agra_order_items(id) on delete cascade,
  inventory_batch_id uuid not null references public.agra_inventory_batches(id),
  defect_type text not null,
  defect_description text not null,
  affected_quantity numeric(14,3) not null check (affected_quantity > 0),
  rework_quantity numeric(14,3) not null check (rework_quantity >= 0),
  rejected_quantity numeric(14,3) not null default 0 check (rejected_quantity >= 0),
  responsible_role text not null,
  responsible_user_id uuid references auth.users(id),
  due_date date,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'COMPLETED')),
  completion_date date,
  completion_note text,
  reinspection_result text check (reinspection_result is null or reinspection_result in ('RELEASED', 'BLOCKED', 'DAMAGED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agra_pick_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid not null references public.agra_orders(id) on delete cascade,
  order_item_id uuid not null references public.agra_order_items(id) on delete cascade,
  inventory_batch_id uuid not null references public.agra_inventory_batches(id),
  reservation_id uuid not null references public.agra_inventory_reservations(id),
  quantity_requested numeric(14,3) not null check (quantity_requested > 0),
  quantity_picked numeric(14,3) not null check (quantity_picked >= 0),
  unit text not null,
  picker_id uuid not null references auth.users(id),
  started_at timestamptz not null,
  completed_at timestamptz,
  discrepancy numeric(14,3) not null default 0,
  notes text,
  unique (reservation_id)
);

create table public.agra_packing_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid not null unique references public.agra_orders(id) on delete cascade,
  package_count integer not null default 0 check (package_count >= 0),
  carton_count integer not null default 0 check (carton_count >= 0),
  bundle_count integer not null default 0 check (bundle_count >= 0),
  quantity_per_package numeric(14,3) check (quantity_per_package is null or quantity_per_package > 0),
  packaging_type text not null,
  total_shipment_weight_kg numeric(14,3) check (total_shipment_weight_kg is null or total_shipment_weight_kg >= 0),
  fragile boolean not null default false,
  moisture_protection boolean not null default false,
  custom_packaging_instructions text,
  packer_id uuid not null references auth.users(id),
  packing_started_at timestamptz not null,
  packing_completed_at timestamptz,
  packing_notes text,
  created_at timestamptz not null default now()
);

create table public.agra_packing_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  packing_record_id uuid not null references public.agra_packing_records(id) on delete cascade,
  order_item_id uuid not null references public.agra_order_items(id) on delete cascade,
  packed_quantity numeric(14,3) not null check (packed_quantity >= 0),
  unit text not null,
  unique (packing_record_id, order_item_id)
);

create table public.agra_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid not null references public.agra_orders(id) on delete cascade,
  document_type text not null check (document_type in (
    'CUSTOMER_ORDER', 'PURCHASE_ORDER', 'INVOICE', 'DELIVERY_CHALLAN',
    'DISPATCH_NOTE', 'PACKING_LIST', 'COURIER_REFERENCE',
    'CUSTOMER_PICKUP_ACKNOWLEDGEMENT', 'QUALITY_CERTIFICATE'
  )),
  reference_number text,
  required boolean not null default false,
  status text not null default 'MISSING' check (status in ('MISSING', 'PRESENT', 'VERIFIED')),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  notes text,
  file_url text,
  created_at timestamptz not null default now(),
  unique (order_id, document_type)
);

create table public.agra_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid not null unique references public.agra_orders(id) on delete cascade,
  delivery_method text not null check (delivery_method in (
    'THIRD_PARTY_COURIER', 'HIRED_TRANSPORTER', 'COMPANY_VEHICLE',
    'CUSTOMER_PICKUP', 'BULK_TRUCK', 'EXPORT_FREIGHT', 'OTHER'
  )),
  company_name text,
  contact text,
  tracking_number text,
  consignment_number text,
  package_count integer not null check (package_count > 0),
  shipment_weight_kg numeric(14,3),
  handover_person text not null,
  receiver_name text not null,
  customer_representative text,
  receiver_phone text,
  vehicle_number text,
  driver_name text,
  driver_phone text,
  destination text,
  acknowledgement_reference text,
  handover_at timestamptz not null,
  notes text,
  confirmed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.agra_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  order_id uuid references public.agra_orders(id) on delete cascade,
  code text not null,
  message text not null,
  severity text not null default 'HIGH' check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  affected_quantity numeric(14,3),
  unit text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_note text
);

create table public.agra_action_requests (
  request_id uuid primary key,
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  status text not null default 'PROCESSING' check (status in ('PROCESSING', 'SUCCEEDED', 'FAILED')),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.agra_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agra_organizations(id) on delete cascade,
  request_id uuid,
  actor_id uuid,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_status text,
  new_status text,
  previous_values jsonb,
  new_values jsonb,
  success boolean not null,
  reason text,
  quantity_changes jsonb,
  source text not null default 'DATABASE',
  error_code text,
  created_at timestamptz not null default now()
);

create table public.agra_system_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.agra_organizations(id) on delete cascade,
  source text not null,
  event_type text not null,
  success boolean not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agra_demo_state (
  organization_id uuid primary key references public.agra_organizations(id) on delete cascade,
  dataset_version text not null,
  last_reset_at timestamptz not null default now(),
  last_reset_by uuid,
  environment text not null default 'DEMO'
);

create index agra_profiles_org_idx on public.agra_profiles (organization_id, role);
create index agra_orders_org_status_idx on public.agra_orders (organization_id, fulfillment_status, requested_dispatch_date);
create index agra_order_items_order_idx on public.agra_order_items (order_id);
create index agra_inventory_product_idx on public.agra_inventory_batches (organization_id, product_id, production_date);
create index agra_reservations_order_idx on public.agra_inventory_reservations (order_id, status);
create index agra_qc_order_idx on public.agra_qc_inspections (order_id, inspected_at desc);
create index agra_rework_status_idx on public.agra_rework_records (organization_id, status, due_date);
create index agra_exceptions_status_idx on public.agra_exceptions (organization_id, status, created_at desc);
create index agra_audit_org_time_idx on public.agra_audit_events (organization_id, created_at desc);

create or replace function private.agra_current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.agra_profiles p
  where p.user_id = (select auth.uid()) and p.active
  limit 1
$$;

create or replace function private.agra_current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.agra_profiles p
  where p.user_id = (select auth.uid()) and p.active
  limit 1
$$;

create or replace function private.agra_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.agra_current_role()) = any(allowed_roles), false)
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
revoke all on function private.agra_current_organization_id() from public, anon;
revoke all on function private.agra_current_role() from public, anon;
revoke all on function private.agra_has_role(text[]) from public, anon;
grant execute on function private.agra_current_organization_id() to authenticated, service_role;
grant execute on function private.agra_current_role() to authenticated, service_role;
grant execute on function private.agra_has_role(text[]) to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agra_organizations', 'agra_profiles', 'agra_customers', 'agra_products',
    'agra_orders', 'agra_order_items', 'agra_inventory_batches',
    'agra_inventory_reservations', 'agra_qc_inspections', 'agra_rework_records',
    'agra_pick_records', 'agra_packing_records', 'agra_packing_items',
    'agra_documents', 'agra_handovers', 'agra_exceptions',
    'agra_action_requests', 'agra_audit_events', 'agra_system_events', 'agra_demo_state'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$$;

create policy "members read their organization"
on public.agra_organizations for select to authenticated
using (id = (select private.agra_current_organization_id()));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agra_profiles', 'agra_customers', 'agra_products', 'agra_orders',
    'agra_order_items', 'agra_inventory_batches', 'agra_inventory_reservations',
    'agra_qc_inspections', 'agra_rework_records', 'agra_pick_records',
    'agra_packing_records', 'agra_packing_items', 'agra_documents',
    'agra_handovers', 'agra_exceptions', 'agra_action_requests',
    'agra_audit_events', 'agra_system_events', 'agra_demo_state'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = (select private.agra_current_organization_id()))',
      table_name || ' organization read',
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agra_organizations', 'agra_profiles', 'agra_customers', 'agra_products',
    'agra_orders', 'agra_order_items', 'agra_inventory_batches',
    'agra_inventory_reservations', 'agra_qc_inspections', 'agra_rework_records',
    'agra_pick_records', 'agra_packing_records', 'agra_packing_items',
    'agra_documents', 'agra_handovers', 'agra_exceptions',
    'agra_action_requests', 'agra_audit_events', 'agra_system_events', 'agra_demo_state'
  ] loop
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', table_name);
  end loop;
end
$$;
grant select on table
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
to authenticated;
