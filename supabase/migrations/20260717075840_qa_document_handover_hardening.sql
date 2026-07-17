create or replace function private.agra_mark_document_block()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.code = 'MISSING_REQUIRED_DOCUMENT' and new.status = 'OPEN' then
    update public.agra_orders
    set fulfillment_status = 'BLOCKED', updated_at = now()
    where id = new.order_id
      and organization_id = new.organization_id
      and fulfillment_status = 'READY_FOR_HANDOVER';
  end if;
  return new;
end
$$;

create or replace function private.agra_clear_document_block()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not exists (
    select 1 from public.agra_documents
    where order_id = new.order_id and required and status <> 'VERIFIED'
  ) then
    update public.agra_exceptions
    set status = 'RESOLVED',
        resolved_at = now(),
        resolved_by = new.verified_by,
        resolution_note = 'Required documents verified.'
    where order_id = new.order_id
      and code = 'MISSING_REQUIRED_DOCUMENT'
      and status = 'OPEN';

    update public.agra_orders o
    set fulfillment_status = 'READY_FOR_HANDOVER', updated_at = now()
    where o.id = new.order_id
      and o.organization_id = new.organization_id
      and o.fulfillment_status = 'BLOCKED'
      and not exists (
        select 1 from public.agra_exceptions e
        where e.order_id = o.id and e.status = 'OPEN'
      );
  end if;
  return new;
end
$$;

create or replace function private.agra_guard_handover_details()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.package_count <= 0 or nullif(btrim(new.handover_person), '') is null then
    raise exception using errcode = '22023', message = 'Package count and handover person are required.';
  end if;

  if new.delivery_method in ('THIRD_PARTY_COURIER', 'HIRED_TRANSPORTER', 'EXPORT_FREIGHT')
     and (nullif(btrim(new.company_name), '') is null
       or (nullif(btrim(new.tracking_number), '') is null and nullif(btrim(new.consignment_number), '') is null)) then
    raise exception using errcode = '22023', message = 'Courier company and tracking or consignment number are required.';
  elsif new.delivery_method = 'CUSTOMER_PICKUP'
     and (coalesce(nullif(btrim(new.customer_representative), ''), nullif(btrim(new.receiver_name), '')) is null
       or nullif(btrim(new.receiver_phone), '') is null
       or nullif(btrim(new.acknowledgement_reference), '') is null) then
    raise exception using errcode = '22023', message = 'Pickup representative, phone, and acknowledgement are required.';
  elsif new.delivery_method = 'OWN_VEHICLE'
     and (nullif(btrim(new.vehicle_number), '') is null
       or nullif(btrim(new.driver_name), '') is null
       or nullif(btrim(new.destination), '') is null) then
    raise exception using errcode = '22023', message = 'Vehicle, driver, and destination are required.';
  end if;

  return new;
end
$$;

revoke all on function private.agra_mark_document_block() from public, anon, authenticated;
revoke all on function private.agra_clear_document_block() from public, anon, authenticated;
revoke all on function private.agra_guard_handover_details() from public, anon, authenticated;

drop trigger if exists agra_mark_document_block_after_exception on public.agra_exceptions;
create trigger agra_mark_document_block_after_exception
after insert on public.agra_exceptions
for each row execute function private.agra_mark_document_block();

drop trigger if exists agra_clear_document_block_after_document on public.agra_documents;
create trigger agra_clear_document_block_after_document
after insert or update of status, reference_number on public.agra_documents
for each row execute function private.agra_clear_document_block();

drop trigger if exists agra_guard_handover_details_before_write on public.agra_handovers;
create trigger agra_guard_handover_details_before_write
before insert or update on public.agra_handovers
for each row execute function private.agra_guard_handover_details();
