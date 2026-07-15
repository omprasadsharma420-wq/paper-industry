create extension if not exists pgcrypto;

create type public.app_role as enum (
  'DISPATCH_CLERK',
  'WAREHOUSE_QUALITY',
  'DISPATCH_SUPERVISOR',
  'GATE_SECURITY',
  'MANAGER_ADMIN'
);

create type public.workflow_status as enum (
  'DRAFT',
  'AWAITING_APPROVAL',
  'REJECTED',
  'APPROVED',
  'VEHICLE_ASSIGNED',
  'VEHICLE_ARRIVED',
  'LOADING',
  'AWAITING_WEIGHT_CHECK',
  'AWAITING_DOCUMENT_CHECK',
  'AWAITING_GATE_CLEARANCE',
  'CLEARED_FOR_EXIT',
  'DISPATCHED',
  'CANCELLED'
);

create type public.control_status as enum ('CLEAR', 'WARNING', 'BLOCKED');
create type public.quality_status as enum ('PENDING_INSPECTION', 'RELEASED', 'BLOCKED');
create type public.product_type as enum ('PAPER_REEL', 'SHEET_REAM');
create type public.product_unit as enum ('KG', 'REAM');
create type public.customer_type as enum ('DISTRIBUTOR', 'WHOLESALER', 'COMMERCIAL');
create type public.dispatch_priority as enum ('NORMAL', 'URGENT');
create type public.document_type as enum (
  'COMMERCIAL_INVOICE',
  'DELIVERY_CHALLAN',
  'PACKING_LIST',
  'GATE_PASS'
);
create type public.exception_severity as enum ('LOW', 'MEDIUM', 'HIGH');

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role public.app_role not null,
  department text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  code text primary key,
  name text not null,
  product_type public.product_type not null,
  unit public.product_unit not null,
  gsm integer not null check (gsm > 0),
  grade text not null,
  shade text not null,
  size text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer_type public.customer_type not null,
  default_destination text not null,
  contact_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  product_code text not null references public.products(code),
  on_hand_qty numeric(14, 2) not null check (on_hand_qty >= 0),
  reserved_qty numeric(14, 2) not null default 0 check (reserved_qty >= 0),
  quality_status public.quality_status not null default 'PENDING_INSPECTION',
  location text not null,
  produced_on date not null,
  created_at timestamptz not null default now(),
  constraint inventory_reserved_not_above_on_hand check (reserved_qty <= on_hand_qty)
);

create table public.dispatch_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  customer_id uuid references public.customers(id),
  customer_name text not null,
  customer_type public.customer_type not null,
  destination text not null,
  status public.workflow_status not null default 'DRAFT',
  control_status public.control_status not null default 'CLEAR',
  priority public.dispatch_priority not null default 'NORMAL',
  requested_dispatch_date date not null,
  created_by_name text not null,
  approved_by_name text,
  weight_tolerance_percent numeric(5, 2) not null default 1.50,
  expected_weight_kg numeric(14, 2),
  actual_weight_kg numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dispatch_lines (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatch_requests(id) on delete cascade,
  product_code text not null references public.products(code),
  product_type public.product_type not null,
  unit public.product_unit not null,
  requested_qty numeric(14, 2) not null check (requested_qty > 0),
  created_at timestamptz not null default now()
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  dispatch_line_id uuid not null references public.dispatch_lines(id) on delete cascade,
  inventory_batch_id uuid not null references public.inventory_batches(id),
  reserved_qty numeric(14, 2) not null check (reserved_qty > 0),
  reserved_at timestamptz not null default now(),
  deducted_at timestamptz,
  unique (dispatch_line_id, inventory_batch_id)
);

create table public.vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null unique references public.dispatch_requests(id) on delete cascade,
  vehicle_no text not null,
  transporter text not null,
  driver_name text not null,
  driver_phone text not null,
  expected_arrival timestamptz,
  arrival_recorded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.dispatch_documents (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatch_requests(id) on delete cascade,
  document_type public.document_type not null,
  present boolean not null default false,
  verified boolean not null default false,
  verified_by_name text,
  verified_at timestamptz,
  unique (dispatch_id, document_type)
);

create table public.dispatch_exceptions (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatch_requests(id) on delete cascade,
  code text not null,
  message text not null,
  severity public.exception_severity not null default 'HIGH',
  control_status public.control_status not null default 'BLOCKED',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid references public.dispatch_requests(id) on delete set null,
  actor_name text not null,
  actor_role public.app_role not null,
  action text not null,
  from_status public.workflow_status,
  to_status public.workflow_status,
  note text not null,
  created_at timestamptz not null default now()
);

create index inventory_batches_product_quality_idx
  on public.inventory_batches (product_code, quality_status);

create index dispatch_requests_status_control_idx
  on public.dispatch_requests (status, control_status);

create index dispatch_exceptions_dispatch_active_idx
  on public.dispatch_exceptions (dispatch_id, resolved_at);

create index audit_logs_dispatch_created_idx
  on public.audit_logs (dispatch_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger dispatch_requests_set_updated_at
before update on public.dispatch_requests
for each row execute function public.set_updated_at();

create or replace function public.released_available_qty(p_product_code text)
returns numeric
language sql
stable
as $$
  select coalesce(sum(on_hand_qty - reserved_qty), 0)
  from public.inventory_batches
  where product_code = p_product_code
    and quality_status = 'RELEASED';
$$;

alter table public.user_profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.dispatch_requests enable row level security;
alter table public.dispatch_lines enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.vehicle_assignments enable row level security;
alter table public.dispatch_documents enable row level security;
alter table public.dispatch_exceptions enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated read user profiles"
on public.user_profiles for select
to authenticated
using (true);

create policy "authenticated read products"
on public.products for select
to authenticated
using (true);

create policy "authenticated read customers"
on public.customers for select
to authenticated
using (true);

create policy "authenticated read inventory"
on public.inventory_batches for select
to authenticated
using (true);

create policy "authenticated read dispatch requests"
on public.dispatch_requests for select
to authenticated
using (true);

create policy "authenticated read dispatch lines"
on public.dispatch_lines for select
to authenticated
using (true);

create policy "authenticated read reservations"
on public.inventory_reservations for select
to authenticated
using (true);

create policy "authenticated read vehicles"
on public.vehicle_assignments for select
to authenticated
using (true);

create policy "authenticated read documents"
on public.dispatch_documents for select
to authenticated
using (true);

create policy "authenticated read exceptions"
on public.dispatch_exceptions for select
to authenticated
using (true);

create policy "authenticated read audit"
on public.audit_logs for select
to authenticated
using (true);

create policy "authenticated insert dispatch requests"
on public.dispatch_requests for insert
to authenticated
with check (true);

create policy "authenticated update dispatch requests"
on public.dispatch_requests for update
to authenticated
using (true)
with check (true);

create policy "authenticated insert dispatch lines"
on public.dispatch_lines for insert
to authenticated
with check (true);

create policy "authenticated update inventory batches"
on public.inventory_batches for update
to authenticated
using (true)
with check (true);

create policy "authenticated insert reservations"
on public.inventory_reservations for insert
to authenticated
with check (true);

create policy "authenticated update reservations"
on public.inventory_reservations for update
to authenticated
using (true)
with check (true);

create policy "authenticated insert vehicles"
on public.vehicle_assignments for insert
to authenticated
with check (true);

create policy "authenticated update vehicles"
on public.vehicle_assignments for update
to authenticated
using (true)
with check (true);

create policy "authenticated insert documents"
on public.dispatch_documents for insert
to authenticated
with check (true);

create policy "authenticated update documents"
on public.dispatch_documents for update
to authenticated
using (true)
with check (true);

create policy "authenticated insert exceptions"
on public.dispatch_exceptions for insert
to authenticated
with check (true);

create policy "authenticated update exceptions"
on public.dispatch_exceptions for update
to authenticated
using (true)
with check (true);

create policy "authenticated insert audit"
on public.audit_logs for insert
to authenticated
with check (true);
