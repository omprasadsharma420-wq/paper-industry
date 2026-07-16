create or replace function private.agra_seed_demo_data()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_org constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_sales uuid;
  v_quality uuid;
  v_packer uuid;
  v_supervisor uuid;
  v_manager uuid;
begin
  insert into public.agra_organizations (id, code, name, is_demo, active)
  values (v_org, 'AGRA-DEMO', 'Agra Industries Pvt. Ltd.', true, true)
  on conflict (id) do update set name = excluded.name, is_demo = true, active = true;

  select user_id into v_sales from public.agra_profiles where organization_id = v_org and role = 'SALES_ORDER_COORDINATOR' and active limit 1;
  select user_id into v_quality from public.agra_profiles where organization_id = v_org and role = 'INVENTORY_QUALITY' and active limit 1;
  select user_id into v_packer from public.agra_profiles where organization_id = v_org and role = 'PACKING_DISPATCH' and active limit 1;
  select user_id into v_supervisor from public.agra_profiles where organization_id = v_org and role = 'OPERATIONS_SUPERVISOR' and active limit 1;
  select user_id into v_manager from public.agra_profiles where organization_id = v_org and role = 'MANAGER_ADMIN' and active limit 1;

  delete from public.agra_handovers where organization_id = v_org;
  delete from public.agra_packing_items where organization_id = v_org;
  delete from public.agra_packing_records where organization_id = v_org;
  delete from public.agra_pick_records where organization_id = v_org;
  delete from public.agra_qc_inspections where organization_id = v_org;
  delete from public.agra_rework_records where organization_id = v_org;
  delete from public.agra_documents where organization_id = v_org;
  delete from public.agra_inventory_reservations where organization_id = v_org;
  delete from public.agra_exceptions where organization_id = v_org;
  delete from public.agra_order_items where organization_id = v_org;
  delete from public.agra_orders where organization_id = v_org;
  delete from public.agra_inventory_batches where organization_id = v_org;
  delete from public.agra_products where organization_id = v_org;
  delete from public.agra_customers where organization_id = v_org;

  insert into public.agra_customers
    (id, organization_id, customer_code, name, customer_type, contact_name, phone, email, address)
  values
    ('20000000-0000-4000-8000-000000000001', v_org, 'CUS-001', 'Kathmandu Eco Gifts Pvt. Ltd.', 'BUSINESS', 'Sujata Shrestha', '9801002001', 'orders@kathmanduecogifts.example', 'Lalitpur, Nepal'),
    ('20000000-0000-4000-8000-000000000002', v_org, 'CUS-002', 'Himalaya Hospitality Group', 'BUSINESS', 'Aarav Karki', '9801002002', 'purchase@himalayahospitality.example', 'Kathmandu, Nepal'),
    ('20000000-0000-4000-8000-000000000003', v_org, 'CUS-003', 'Nepal Craft House', 'RETAIL', 'Bina Rai', '9801002003', 'hello@nepalcrafthouse.example', 'Bhaktapur, Nepal'),
    ('20000000-0000-4000-8000-000000000004', v_org, 'CUS-004', 'Green Path Events', 'BUSINESS', 'Milan Thapa', '9801002004', 'events@greenpath.example', 'Pokhara, Nepal'),
    ('20000000-0000-4000-8000-000000000005', v_org, 'CUS-005', 'Community Learning Nepal', 'INSTITUTION', 'Nima Tamang', '9801002005', 'procurement@cln.example', 'Hetauda, Nepal');

  insert into public.agra_products
    (id, organization_id, sku, name, category, description, size, length_cm, width_cm, height_cm, colour, design, material, paper_type, pages, packaging_specification, custom_branding_capable, primary_unit, standard_package_quantity, minimum_stock_level)
  values
    ('10000000-0000-4000-8000-000000000001', v_org, 'KHK-DIA-A5-NAT', 'A5 KhoriyaCo Handmade Diary', 'HANDCRAFTED_DIARY', 'Hand-bound diary made with broom-grass handmade paper.', 'A5', 21, 14.8, 1.8, 'Natural', 'Plain cover', 'Broom-grass paper', 'KhoriyaCo. Kagaj', 120, '20 diaries per inner pack', true, 'PIECE', 20, 60),
    ('10000000-0000-4000-8000-000000000002', v_org, 'KHK-BAG-M-NAT', 'Medium Natural Paper Bag', 'PAPER_BAG', 'Reusable handmade paper bag with reinforced handles.', 'Medium', 28, 22, 10, 'Natural', 'Twisted paper handle', 'Broom-grass paper', 'KhoriyaCo. Kagaj', null, '25 bags per bundle', true, 'PIECE', 25, 100),
    ('10000000-0000-4000-8000-000000000003', v_org, 'KHK-SHT-A3-NAT', 'A3 Broom-Grass Handmade Paper Sheet', 'HANDMADE_PAPER_SHEET', 'Natural textured handmade sheet for craft and packaging.', 'A3', 42, 29.7, null, 'Natural', 'Deckle edge', 'Broom-grass fibre', 'KhoriyaCo. Kagaj', null, '50 sheets per protected pack', false, 'SHEET', 50, 150),
    ('10000000-0000-4000-8000-000000000004', v_org, 'KHK-BOX-GIFT-CUST', 'Custom Printed Gift Box', 'GIFT_BOX', 'Rigid handmade paper gift box for branded orders.', 'Medium', 24, 18, 8, 'Custom', 'Customer artwork', 'Paper board and broom-grass paper', 'KhoriyaCo. Kagaj wrap', null, '10 boxes per carton with inserts', true, 'PIECE', 10, 30),
    ('10000000-0000-4000-8000-000000000005', v_org, 'KHK-FRM-A4-NAT', 'Handmade Decorative Paper Frame', 'PAPER_FRAME', 'Lightweight decorative frame made from broom-grass paper.', 'A4', 34, 25, 2, 'Natural', 'Pressed texture', 'Broom-grass paper composite', 'KhoriyaCo. Kagaj', null, 'Individually wrapped with corner protection', true, 'PIECE', 1, 12);

  insert into public.agra_inventory_batches
    (id, organization_id, product_id, batch_no, production_date, qc_status, qc_release_date, storage_location, shelf_reference, physical_quantity, pending_quantity, released_quantity, reserved_quantity, rework_quantity, blocked_quantity, damaged_quantity, unit, notes)
  values
    ('50000000-0000-4000-8000-000000000001', v_org, '10000000-0000-4000-8000-000000000001', 'DIA-2607-A', current_date - 18, 'RELEASED', current_date - 16, 'Finished Goods Room', 'D-01', 250, 0, 250, 0, 0, 0, 0, 'PIECE', 'Released diary batch for the guided demonstration.'),
    ('50000000-0000-4000-8000-000000000002', v_org, '10000000-0000-4000-8000-000000000002', 'BAG-2607-A', current_date - 14, 'RELEASED', current_date - 12, 'Finished Goods Room', 'B-02', 220, 0, 220, 0, 0, 0, 0, 'PIECE', 'Released bag stock.'),
    ('50000000-0000-4000-8000-000000000003', v_org, '10000000-0000-4000-8000-000000000002', 'BAG-2607-RW', current_date - 7, 'REWORK_REQUIRED', null, 'Quality Hold Area', 'QH-01', 30, 0, 0, 0, 30, 0, 0, 'PIECE', 'Handle adhesion requires rework.'),
    ('50000000-0000-4000-8000-000000000004', v_org, '10000000-0000-4000-8000-000000000003', 'SHT-2606-A', current_date - 28, 'RELEASED', current_date - 26, 'Sheet Store', 'S-04', 400, 0, 400, 0, 0, 0, 0, 'SHEET', 'Released natural A3 sheets.'),
    ('50000000-0000-4000-8000-000000000005', v_org, '10000000-0000-4000-8000-000000000003', 'SHT-2607-P', current_date - 2, 'PENDING_QC', null, 'Drying and QC Area', 'QC-03', 40, 40, 0, 0, 0, 0, 0, 'SHEET', 'Awaiting moisture and size checks.'),
    ('50000000-0000-4000-8000-000000000006', v_org, '10000000-0000-4000-8000-000000000004', 'BOX-2607-A', current_date - 20, 'RELEASED', current_date - 18, 'Finished Goods Room', 'BX-02', 80, 0, 80, 20, 0, 0, 0, 'PIECE', 'Twenty boxes reserved for a packed order.'),
    ('50000000-0000-4000-8000-000000000007', v_org, '10000000-0000-4000-8000-000000000005', 'FRM-2606-A', current_date - 32, 'RELEASED', current_date - 30, 'Finished Goods Room', 'F-01', 38, 0, 38, 0, 0, 0, 0, 'PIECE', 'Current stock after a completed dispatch.');

  insert into public.agra_orders
    (id, organization_id, order_no, customer_id, customer_order_reference, order_status, fulfillment_status, fulfillment_source, priority, order_date, requested_dispatch_date, delivery_deadline, is_custom_order, customization_summary, logo_or_branding_required, customer_specification_confirmed, sample_approval_required, sample_approved, special_packaging_instructions, notes, created_by, approved_by, approved_at, dispatched_at)
  values
    ('30000000-0000-4000-8000-000000000001', v_org, 'AGRA-DEMO-001', '20000000-0000-4000-8000-000000000001', 'KEG-PO-200', 'DRAFT', 'DRAFT', 'FINISHED_STOCK', 'HIGH', current_date, current_date + 3, current_date + 3, true, 'Natural A5 diaries with customer logo on the cover.', true, true, false, false, 'Pack in 10 moisture-protected cartons.', 'Guided demo order: 200 diaries from 250 released.', v_sales, null, null, null),
    ('30000000-0000-4000-8000-000000000002', v_org, 'AGRA-DEMO-002', '20000000-0000-4000-8000-000000000004', 'GPE-BAG-300', 'CONFIRMED', 'AWAITING_STOCK_CHECK', 'FINISHED_STOCK', 'URGENT', current_date - 1, current_date + 2, current_date + 2, true, 'Natural bags with event mark.', true, true, false, false, 'Bundle by 25.', 'Failure scenario: 300 requested with only 220 released.', v_sales, null, null, null),
    ('30000000-0000-4000-8000-000000000003', v_org, 'AGRA-DEMO-003', '20000000-0000-4000-8000-000000000003', 'NCH-BAG-RW-30', 'CONFIRMED', 'REWORK_REQUIRED', 'FINISHED_STOCK', 'NORMAL', current_date - 4, current_date + 4, current_date + 4, false, null, false, true, false, false, 'Protect handles from compression.', 'Quality rework scenario.', v_sales, v_supervisor, now() - interval '3 days', null),
    ('30000000-0000-4000-8000-000000000004', v_org, 'AGRA-DEMO-004', '20000000-0000-4000-8000-000000000002', 'HHG-BOX-020', 'CONFIRMED', 'READY_FOR_HANDOVER', 'FINISHED_STOCK', 'HIGH', current_date - 6, current_date, current_date, true, 'Hospitality gift boxes with gold screen print.', true, true, true, true, 'Use corner protection and moisture barrier.', 'Missing packing list blocks handover.', v_sales, v_supervisor, now() - interval '5 days', null),
    ('30000000-0000-4000-8000-000000000005', v_org, 'AGRA-DEMO-005', '20000000-0000-4000-8000-000000000005', 'CLN-FRM-012', 'CLOSED', 'DISPATCHED', 'FINISHED_STOCK', 'NORMAL', current_date - 12, current_date - 7, current_date - 7, false, null, false, true, false, false, 'Individual protective wrap.', 'Completed customer pickup example.', v_sales, v_supervisor, now() - interval '11 days', now() - interval '7 days');

  insert into public.agra_order_items
    (id, organization_id, order_id, product_id, requested_quantity, approved_quantity, unit, customization, notes)
  values
    ('40000000-0000-4000-8000-000000000001', v_org, '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 200, 0, 'PIECE', '{"coverBranding":"Kathmandu Eco Gifts","colour":"Natural"}', 'Guided demo line.'),
    ('40000000-0000-4000-8000-000000000002', v_org, '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 300, 0, 'PIECE', '{"print":"Green Path Events"}', 'Deliberate shortage scenario.'),
    ('40000000-0000-4000-8000-000000000003', v_org, '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 30, 30, 'PIECE', '{}', 'Handle adhesion rework.'),
    ('40000000-0000-4000-8000-000000000004', v_org, '30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 20, 20, 'PIECE', '{"print":"Himalaya Hospitality"}', 'Packed into two cartons.'),
    ('40000000-0000-4000-8000-000000000005', v_org, '30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 12, 12, 'PIECE', '{}', 'Completed dispatch history.');

  insert into public.agra_inventory_reservations
    (id, organization_id, order_id, order_item_id, inventory_batch_id, reserved_quantity, unit, status, request_id, reserved_at)
  values
    ('60000000-0000-4000-8000-000000000001', v_org, '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000006', 20, 'PIECE', 'ACTIVE', '70000000-0000-4000-8000-000000000001', now() - interval '5 days');

  insert into public.agra_rework_records
    (id, organization_id, order_id, order_item_id, inventory_batch_id, defect_type, defect_description, affected_quantity, rework_quantity, rejected_quantity, responsible_role, responsible_user_id, due_date, status)
  values
    ('80000000-0000-4000-8000-000000000001', v_org, '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 'HANDLE_ADHESION', 'Handle joints require reinforcement and reinspection.', 30, 30, 0, 'INVENTORY_QUALITY', v_quality, current_date + 2, 'OPEN');

  insert into public.agra_documents
    (organization_id, order_id, document_type, reference_number, required, status, verified_by, verified_at, notes)
  values
    (v_org, '30000000-0000-4000-8000-000000000004', 'INVOICE', 'INV-DEMO-004', true, 'VERIFIED', v_supervisor, now() - interval '1 day', null),
    (v_org, '30000000-0000-4000-8000-000000000004', 'PACKING_LIST', null, true, 'MISSING', null, null, 'Required before courier handover.'),
    (v_org, '30000000-0000-4000-8000-000000000004', 'DISPATCH_NOTE', 'DN-DEMO-004', true, 'VERIFIED', v_supervisor, now() - interval '1 day', null);

  if v_packer is not null then
    insert into public.agra_pick_records
      (id, organization_id, order_id, order_item_id, inventory_batch_id, reservation_id, quantity_requested, quantity_picked, unit, picker_id, started_at, completed_at, discrepancy, notes)
    values
      ('81000000-0000-4000-8000-000000000001', v_org, '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000001', 20, 20, 'PIECE', v_packer, now() - interval '3 days', now() - interval '3 days' + interval '20 minutes', 0, 'Count matched reservation.');

    insert into public.agra_packing_records
      (id, organization_id, order_id, package_count, carton_count, bundle_count, quantity_per_package, packaging_type, total_shipment_weight_kg, fragile, moisture_protection, custom_packaging_instructions, packer_id, packing_started_at, packing_completed_at, packing_notes)
    values
      ('82000000-0000-4000-8000-000000000001', v_org, '30000000-0000-4000-8000-000000000004', 2, 2, 0, 10, 'Reinforced carton', 14.5, true, true, 'Corner protection and moisture barrier.', v_packer, now() - interval '2 days', now() - interval '2 days' + interval '35 minutes', 'Packed quantity matches approved quantity.');

    insert into public.agra_packing_items
      (id, organization_id, packing_record_id, order_item_id, packed_quantity, unit)
    values
      ('83000000-0000-4000-8000-000000000001', v_org, '82000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', 20, 'PIECE');
  end if;

  if v_quality is not null then
    insert into public.agra_qc_inspections
      (id, organization_id, order_id, order_item_id, inventory_batch_id, product_category, inspected_quantity, passed_quantity, result, checklist, inspected_by, inspected_at, notes)
    values
      ('84000000-0000-4000-8000-000000000001', v_org, '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000006', 'GIFT_BOX', 20, 20, 'PASSED', '{"dimensions":true,"structure":true,"branding":true,"shape":true,"damageFree":true,"inserts":true,"cartonQuantity":true}', v_quality, now() - interval '2 days' - interval '1 hour', 'All checks passed.');
  end if;

  if v_manager is not null then
    insert into public.agra_handovers
      (id, organization_id, order_id, delivery_method, package_count, handover_person, receiver_name, customer_representative, receiver_phone, acknowledgement_reference, handover_at, notes, confirmed_by)
    values
      ('85000000-0000-4000-8000-000000000001', v_org, '30000000-0000-4000-8000-000000000005', 'CUSTOMER_PICKUP', 12, 'Suman Rai', 'Nima Tamang', 'Nima Tamang', '9801002005', 'PICKUP-DEMO-005', now() - interval '7 days', 'Twelve individually protected frames collected.', v_manager);
  end if;

  insert into public.agra_exceptions
    (organization_id, order_id, code, message, severity, status, affected_quantity, unit)
  values
    (v_org, '30000000-0000-4000-8000-000000000003', 'QUALITY_REWORK_REQUIRED', 'Thirty bags require handle-joint reinforcement before release.', 'HIGH', 'OPEN', 30, 'PIECE'),
    (v_org, '30000000-0000-4000-8000-000000000004', 'MISSING_REQUIRED_DOCUMENT', 'Packing list is missing. Courier handover is blocked.', 'HIGH', 'OPEN', null, null);

  insert into public.agra_demo_state (organization_id, dataset_version, last_reset_at, last_reset_by, environment)
  values (v_org, '2026-07-17.agra-pilot.v1', now(), v_manager, 'DEMO')
  on conflict (organization_id) do update
    set dataset_version = excluded.dataset_version,
        last_reset_at = excluded.last_reset_at,
        last_reset_by = excluded.last_reset_by,
        environment = excluded.environment;

  insert into public.agra_audit_events
    (organization_id, actor_id, actor_name, actor_role, action, entity_type, success, reason, source)
  values
    (v_org, v_manager, 'Demo data service', 'SYSTEM', 'DEMO_DATA_SEEDED', 'DATASET', true, 'Agra reference-pilot dataset restored.', 'DATABASE');
end
$$;

revoke all on function private.agra_seed_demo_data() from public, anon, authenticated;
grant execute on function private.agra_seed_demo_data() to service_role;

select private.agra_seed_demo_data();
