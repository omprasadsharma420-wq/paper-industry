-- Keep the reference dataset operational without weakening normal order creation.
-- Live orders already receive these rows in agra_execute_action(CREATE_ORDER).
create or replace function private.agra_prepare_reference_documents()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.agra_documents
    (organization_id, order_id, document_type, reference_number, required, status, verified_at, notes)
  select
    orders.organization_id,
    orders.id,
    document.document_type,
    case
      when document.document_type = 'CUSTOMER_ORDER' then orders.order_no
      when orders.fulfillment_status = 'DISPATCHED' then document.prefix || orders.order_no
      else null
    end,
    document.required,
    case
      when document.document_type = 'CUSTOMER_ORDER' then 'PRESENT'
      when orders.fulfillment_status = 'DISPATCHED' then 'VERIFIED'
      else 'MISSING'
    end,
    case
      when document.document_type <> 'CUSTOMER_ORDER'
       and orders.fulfillment_status = 'DISPATCHED' then now()
      else null
    end,
    case
      when document.document_type = 'CUSTOMER_ORDER' then 'Reference order received.'
      when orders.fulfillment_status = 'DISPATCHED' then 'Verified reference document.'
      else 'Required before handover.'
    end
  from public.agra_orders as orders
  cross join (
    values
      ('CUSTOMER_ORDER'::text, false, ''::text),
      ('INVOICE'::text, true, 'INV-'::text),
      ('PACKING_LIST'::text, true, 'PL-'::text),
      ('DISPATCH_NOTE'::text, true, 'DN-'::text)
  ) as document(document_type, required, prefix)
  where orders.id in (
    '30000000-0000-4000-8000-000000000001'::uuid,
    '30000000-0000-4000-8000-000000000002'::uuid,
    '30000000-0000-4000-8000-000000000003'::uuid,
    '30000000-0000-4000-8000-000000000005'::uuid
  )
  on conflict (order_id, document_type) do nothing;

  return null;
end
$$;

revoke all on function private.agra_prepare_reference_documents() from public, anon, authenticated;

drop trigger if exists agra_prepare_reference_documents_after_insert on public.agra_orders;
create trigger agra_prepare_reference_documents_after_insert
after insert on public.agra_orders
for each statement
execute function private.agra_prepare_reference_documents();

-- Backfill checklists created before this guard was installed. Completed orders
-- receive historical references; open orders remain intentionally unverified.
insert into public.agra_documents
  (organization_id, order_id, document_type, reference_number, required, status, verified_at, notes)
select
  orders.organization_id,
  orders.id,
  document.document_type,
  case
    when document.document_type = 'CUSTOMER_ORDER' then orders.order_no
    when orders.fulfillment_status = 'DISPATCHED' then document.prefix || orders.order_no
    else null
  end,
  document.required,
  case
    when document.document_type = 'CUSTOMER_ORDER' then 'PRESENT'
    when orders.fulfillment_status = 'DISPATCHED' then 'VERIFIED'
    else 'MISSING'
  end,
  case
    when document.document_type <> 'CUSTOMER_ORDER'
     and orders.fulfillment_status = 'DISPATCHED' then now()
    else null
  end,
  case
    when document.document_type = 'CUSTOMER_ORDER' then 'Reference order received.'
    when orders.fulfillment_status = 'DISPATCHED' then 'Verified historical document.'
    else 'Required before handover.'
  end
from public.agra_orders as orders
cross join (
  values
    ('CUSTOMER_ORDER'::text, false, ''::text),
    ('INVOICE'::text, true, 'INV-'::text),
    ('PACKING_LIST'::text, true, 'PL-'::text),
    ('DISPATCH_NOTE'::text, true, 'DN-'::text)
) as document(document_type, required, prefix)
on conflict (order_id, document_type) do nothing;

create or replace function private.agra_guard_handover_documents()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  verified_required_documents integer;
begin
  if not exists (
    select 1
    from public.agra_orders
    where id = new.order_id
      and organization_id = new.organization_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'The handover must belong to the same organization as the order.';
  end if;

  select count(*)
  into verified_required_documents
  from public.agra_documents
  where organization_id = new.organization_id
    and order_id = new.order_id
    and required
    and status = 'VERIFIED'
    and document_type in ('INVOICE', 'PACKING_LIST', 'DISPATCH_NOTE');

  if verified_required_documents <> 3 then
    raise exception using
      errcode = 'P1003',
      message = 'Verify every required document before handover.';
  end if;

  return new;
end
$$;

revoke all on function private.agra_guard_handover_documents() from public, anon, authenticated;

drop trigger if exists agra_guard_handover_documents_before_write on public.agra_handovers;
create trigger agra_guard_handover_documents_before_write
before insert or update on public.agra_handovers
for each row
execute function private.agra_guard_handover_documents();
