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
  elsif new.delivery_method = 'COMPANY_VEHICLE'
     and (nullif(btrim(new.vehicle_number), '') is null
       or nullif(btrim(new.driver_name), '') is null
       or nullif(btrim(new.destination), '') is null) then
    raise exception using errcode = '22023', message = 'Vehicle, driver, and destination are required.';
  end if;

  return new;
end
$$;

revoke all on function private.agra_guard_handover_details() from public, anon, authenticated;
