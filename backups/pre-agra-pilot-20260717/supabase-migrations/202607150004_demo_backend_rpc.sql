create or replace function public.demo_seed_dispatch_control()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table
    audit_logs,
    dispatch_exceptions,
    dispatch_documents,
    vehicle_assignments,
    inventory_reservations,
    dispatch_lines,
    dispatch_requests,
    inventory_batches,
    customers,
    products,
    user_profiles
  restart identity cascade;

  insert into user_profiles (id, full_name, role, department) values
    ('11111111-1111-1111-1111-111111111001', 'Anita Karki', 'DISPATCH_CLERK', 'Dispatch Office'),
    ('11111111-1111-1111-1111-111111111002', 'Ramesh Thapa', 'WAREHOUSE_QUALITY', 'Warehouse and Quality'),
    ('11111111-1111-1111-1111-111111111003', 'Sanjay Gupta', 'DISPATCH_SUPERVISOR', 'Dispatch Control'),
    ('11111111-1111-1111-1111-111111111004', 'Mina Tamang', 'GATE_SECURITY', 'Factory Gate'),
    ('11111111-1111-1111-1111-111111111005', 'Prakash Adhikari', 'MANAGER_ADMIN', 'Operations Management');

  insert into products (code, name, product_type, unit, gsm, grade, shade, size) values
    ('PR-120-KRAFT', 'Kraft Liner Reel', 'PAPER_REEL', 'KG', 120, 'KLB', 'Natural Brown', '1450 mm reel'),
    ('PR-180-WB', 'White Board Reel', 'PAPER_REEL', 'KG', 180, 'Duplex', 'White Back', '1220 mm reel'),
    ('SR-75-MAP', 'Maplitho Sheet Ream', 'SHEET_REAM', 'REAM', 75, 'Writing/Printing', 'Bright White', 'A4 ream'),
    ('SR-90-LEDGER', 'Ledger Sheet Ream', 'SHEET_REAM', 'REAM', 90, 'Ledger', 'Creamwove', 'Legal ream');

  insert into customers (id, name, customer_type, default_destination, contact_phone) values
    ('22222222-2222-2222-2222-222222222001', 'Himalayan Packaging Distributors', 'DISTRIBUTOR', 'Birgunj, Nepal', '9800000145'),
    ('22222222-2222-2222-2222-222222222002', 'Ganga Paper Wholesalers', 'WHOLESALER', 'Patna, India', '9800000146'),
    ('22222222-2222-2222-2222-222222222003', 'Eastern Corrugators Pvt. Ltd.', 'COMMERCIAL', 'Bhairahawa, Nepal', '9800000147'),
    ('22222222-2222-2222-2222-222222222004', 'Kathmandu Print & Pack', 'COMMERCIAL', 'Kathmandu, Nepal', '9800000148'),
    ('22222222-2222-2222-2222-222222222005', 'Janakpur Stationery Traders', 'DISTRIBUTOR', 'Janakpur, Nepal', '9800000149'),
    ('22222222-2222-2222-2222-222222222006', 'Lumbini Box Industries', 'COMMERCIAL', 'Butwal, Nepal', '9800000150');

  insert into inventory_batches (
    id, batch_no, product_code, on_hand_qty, reserved_qty, quality_status, location, produced_on
  ) values
    ('33333333-3333-3333-3333-333333333001', 'KLB-26-0715-A', 'PR-120-KRAFT', 13800, 0, 'RELEASED', 'FG Reel Bay A1', '2026-07-12'),
    ('33333333-3333-3333-3333-333333333002', 'KLB-26-0714-B', 'PR-120-KRAFT', 5600, 0, 'BLOCKED', 'Quality Hold Q2', '2026-07-14'),
    ('33333333-3333-3333-3333-333333333003', 'DUP-26-0713-C', 'PR-180-WB', 11800, 5000, 'RELEASED', 'FG Reel Bay B3', '2026-07-13'),
    ('33333333-3333-3333-3333-333333333004', 'MAP-26-0710-A', 'SR-75-MAP', 3200, 800, 'RELEASED', 'Sheet Store S1', '2026-07-10'),
    ('33333333-3333-3333-3333-333333333005', 'MAP-26-0715-H', 'SR-75-MAP', 1400, 0, 'PENDING_INSPECTION', 'Inspection Queue IQ1', '2026-07-15'),
    ('33333333-3333-3333-3333-333333333006', 'LED-26-0709-D', 'SR-90-LEDGER', 950, 0, 'RELEASED', 'Sheet Store S2', '2026-07-09');

  insert into dispatch_requests (
    id, request_no, customer_id, customer_name, customer_type, destination, status, control_status,
    priority, requested_dispatch_date, created_by_name, approved_by_name, weight_tolerance_percent,
    expected_weight_kg, actual_weight_kg, created_at
  ) values
    ('44444444-4444-4444-4444-444444444001', 'FGD-2026-0715-001', '22222222-2222-2222-2222-222222222001', 'Himalayan Packaging Distributors', 'DISTRIBUTOR', 'Birgunj, Nepal', 'DISPATCHED', 'CLEAR', 'NORMAL', '2026-07-15', 'Anita Karki', 'Sanjay Gupta', 1.5, 4200, 4245, '2026-07-15T02:25:00Z'),
    ('44444444-4444-4444-4444-444444444002', 'FGD-2026-0715-002', '22222222-2222-2222-2222-222222222002', 'Ganga Paper Wholesalers', 'WHOLESALER', 'Patna, India', 'REJECTED', 'BLOCKED', 'URGENT', '2026-07-15', 'Anita Karki', null, 1.5, 0, null, '2026-07-15T03:15:00Z'),
    ('44444444-4444-4444-4444-444444444003', 'FGD-2026-0715-003', '22222222-2222-2222-2222-222222222003', 'Eastern Corrugators Pvt. Ltd.', 'COMMERCIAL', 'Bhairahawa, Nepal', 'REJECTED', 'BLOCKED', 'NORMAL', '2026-07-16', 'Anita Karki', null, 1.5, 5200, null, '2026-07-15T03:40:00Z'),
    ('44444444-4444-4444-4444-444444444004', 'FGD-2026-0715-004', '22222222-2222-2222-2222-222222222004', 'Kathmandu Print & Pack', 'COMMERCIAL', 'Kathmandu, Nepal', 'AWAITING_WEIGHT_CHECK', 'BLOCKED', 'NORMAL', '2026-07-15', 'Anita Karki', 'Sanjay Gupta', 1.5, 5000, 5126, '2026-07-15T01:50:00Z'),
    ('44444444-4444-4444-4444-444444444005', 'FGD-2026-0715-005', '22222222-2222-2222-2222-222222222005', 'Janakpur Stationery Traders', 'DISTRIBUTOR', 'Janakpur, Nepal', 'AWAITING_DOCUMENT_CHECK', 'BLOCKED', 'NORMAL', '2026-07-15', 'Anita Karki', 'Sanjay Gupta', 1.5, 0, null, '2026-07-15T02:55:00Z'),
    ('44444444-4444-4444-4444-444444444006', 'FGD-2026-0715-006', '22222222-2222-2222-2222-222222222006', 'Lumbini Box Industries', 'COMMERCIAL', 'Butwal, Nepal', 'AWAITING_APPROVAL', 'CLEAR', 'NORMAL', '2026-07-16', 'Anita Karki', null, 1.5, 2800, null, '2026-07-15T04:30:00Z');

  insert into dispatch_lines (id, dispatch_id, product_code, product_type, unit, requested_qty) values
    ('55555555-5555-5555-5555-555555555001', '44444444-4444-4444-4444-444444444001', 'PR-120-KRAFT', 'PAPER_REEL', 'KG', 4200),
    ('55555555-5555-5555-5555-555555555002', '44444444-4444-4444-4444-444444444002', 'SR-90-LEDGER', 'SHEET_REAM', 'REAM', 1400),
    ('55555555-5555-5555-5555-555555555003', '44444444-4444-4444-4444-444444444003', 'PR-120-KRAFT', 'PAPER_REEL', 'KG', 5200),
    ('55555555-5555-5555-5555-555555555004', '44444444-4444-4444-4444-444444444004', 'PR-180-WB', 'PAPER_REEL', 'KG', 5000),
    ('55555555-5555-5555-5555-555555555005', '44444444-4444-4444-4444-444444444005', 'SR-75-MAP', 'SHEET_REAM', 'REAM', 800),
    ('55555555-5555-5555-5555-555555555006', '44444444-4444-4444-4444-444444444006', 'PR-180-WB', 'PAPER_REEL', 'KG', 2800);

  insert into inventory_reservations (
    id, dispatch_line_id, inventory_batch_id, reserved_qty, reserved_at, deducted_at
  ) values
    ('66666666-6666-6666-6666-666666666001', '55555555-5555-5555-5555-555555555001', '33333333-3333-3333-3333-333333333001', 4200, '2026-07-15T03:35:00Z', '2026-07-15T06:55:00Z'),
    ('66666666-6666-6666-6666-666666666004', '55555555-5555-5555-5555-555555555004', '33333333-3333-3333-3333-333333333003', 5000, '2026-07-15T04:25:00Z', null),
    ('66666666-6666-6666-6666-666666666005', '55555555-5555-5555-5555-555555555005', '33333333-3333-3333-3333-333333333004', 800, '2026-07-15T04:10:00Z', null);

  insert into vehicle_assignments (
    id, dispatch_id, vehicle_no, transporter, driver_name, driver_phone, expected_arrival, arrival_recorded_at
  ) values
    ('77777777-7777-7777-7777-777777777001', '44444444-4444-4444-4444-444444444001', 'Na 7 Kha 4481', 'Bishal Transport Service', 'Bikash Yadav', '9800000145', '2026-07-15T04:15:00Z', '2026-07-15T04:22:00Z'),
    ('77777777-7777-7777-7777-777777777004', '44444444-4444-4444-4444-444444444004', 'Ba 5 Kha 2390', 'Sagarmatha Logistics', 'Suman Rai', '9811112233', '2026-07-15T05:45:00Z', '2026-07-15T05:48:00Z'),
    ('77777777-7777-7777-7777-777777777005', '44444444-4444-4444-4444-444444444005', 'Pra 2-03-001 Kha 8842', 'Madhesh Carrier', 'Ajay Sah', '9844448877', '2026-07-15T07:15:00Z', '2026-07-15T07:17:00Z');

  insert into dispatch_documents (dispatch_id, document_type, present, verified)
  select id, doc_type::document_type, true, false
  from dispatch_requests
  cross join unnest(array[
    'COMMERCIAL_INVOICE',
    'DELIVERY_CHALLAN',
    'PACKING_LIST',
    'GATE_PASS'
  ]) as required_docs(doc_type);

  update dispatch_documents
  set verified = true, verified_by_name = 'Sanjay Gupta', verified_at = '2026-07-15T05:50:00Z'
  where dispatch_id in (
    '44444444-4444-4444-4444-444444444001',
    '44444444-4444-4444-4444-444444444004'
  );

  update dispatch_documents
  set verified = true, verified_by_name = 'Sanjay Gupta', verified_at = '2026-07-15T07:30:00Z'
  where dispatch_id = '44444444-4444-4444-4444-444444444005'
    and document_type in ('COMMERCIAL_INVOICE', 'DELIVERY_CHALLAN');

  update dispatch_documents
  set present = false, verified = false, verified_by_name = null, verified_at = null
  where dispatch_id = '44444444-4444-4444-4444-444444444005'
    and document_type = 'PACKING_LIST';

  insert into dispatch_exceptions (
    id, dispatch_id, code, message, severity, control_status, created_at
  ) values
    ('88888888-8888-8888-8888-888888888002', '44444444-4444-4444-4444-444444444002', 'INSUFFICIENT_RELEASED_STOCK', 'Requested 1,400 REAM, but only 950 REAM released stock is available.', 'HIGH', 'BLOCKED', '2026-07-15T03:19:00Z'),
    ('88888888-8888-8888-8888-888888888003', '44444444-4444-4444-4444-444444444003', 'QUALITY_BLOCKED_BATCH', 'Batch KLB-26-0714-B is quality blocked and cannot be dispatched.', 'HIGH', 'BLOCKED', '2026-07-15T03:40:00Z'),
    ('88888888-8888-8888-8888-888888888004', '44444444-4444-4444-4444-444444444004', 'WEIGHT_VARIANCE_EXCEEDED', 'Actual weight variance is 2.52%, above the approved 1.5% tolerance.', 'HIGH', 'BLOCKED', '2026-07-15T06:25:00Z'),
    ('88888888-8888-8888-8888-888888888005', '44444444-4444-4444-4444-444444444005', 'MISSING_DOCUMENT', 'Packing list is missing; gate clearance is blocked.', 'HIGH', 'BLOCKED', '2026-07-15T07:45:00Z');

  insert into audit_logs (
    id, dispatch_id, actor_name, actor_role, action, from_status, to_status, note, created_at
  ) values
    ('99999999-9999-9999-9999-999999999001', '44444444-4444-4444-4444-444444444001', 'Anita Karki', 'DISPATCH_CLERK', 'CREATED', null, 'DRAFT', 'Dispatch request created from approved customer order.', '2026-07-15T02:25:00Z'),
    ('99999999-9999-9999-9999-999999999002', '44444444-4444-4444-4444-444444444001', 'Sanjay Gupta', 'DISPATCH_SUPERVISOR', 'APPROVED_AND_RESERVED', 'AWAITING_APPROVAL', 'APPROVED', 'Released inventory reserved from batch KLB-26-0715-A.', '2026-07-15T03:35:00Z'),
    ('99999999-9999-9999-9999-999999999003', '44444444-4444-4444-4444-444444444001', 'Mina Tamang', 'GATE_SECURITY', 'EXIT_CONFIRMED', 'CLEARED_FOR_EXIT', 'DISPATCHED', 'Vehicle exited gate; inventory deducted.', '2026-07-15T06:55:00Z'),
    ('99999999-9999-9999-9999-999999999004', '44444444-4444-4444-4444-444444444002', 'Anita Karki', 'DISPATCH_CLERK', 'CREATED', null, 'DRAFT', 'Urgent wholesale dispatch entered.', '2026-07-15T03:15:00Z'),
    ('99999999-9999-9999-9999-999999999005', '44444444-4444-4444-4444-444444444002', 'System Control', 'MANAGER_ADMIN', 'VALIDATION_REJECTED', 'DRAFT', 'REJECTED', 'Insufficient released stock blocked approval.', '2026-07-15T03:19:00Z'),
    ('99999999-9999-9999-9999-999999999006', '44444444-4444-4444-4444-444444444003', 'Ramesh Thapa', 'WAREHOUSE_QUALITY', 'QUALITY_BLOCK', null, 'REJECTED', 'Requested batch is on quality hold.', '2026-07-15T03:40:00Z'),
    ('99999999-9999-9999-9999-999999999007', '44444444-4444-4444-4444-444444444004', 'Ramesh Thapa', 'WAREHOUSE_QUALITY', 'WEIGHT_CHECK_BLOCKED', 'LOADING', 'AWAITING_WEIGHT_CHECK', 'Weight variance requires supervisor review before document check.', '2026-07-15T06:25:00Z'),
    ('99999999-9999-9999-9999-999999999008', '44444444-4444-4444-4444-444444444005', 'Sanjay Gupta', 'DISPATCH_SUPERVISOR', 'DOCUMENT_CHECK_BLOCKED', 'AWAITING_WEIGHT_CHECK', 'AWAITING_DOCUMENT_CHECK', 'Packing list not attached.', '2026-07-15T07:45:00Z'),
    ('99999999-9999-9999-9999-999999999009', '44444444-4444-4444-4444-444444444006', 'Anita Karki', 'DISPATCH_CLERK', 'SUBMITTED', 'DRAFT', 'AWAITING_APPROVAL', 'Released stock available. Awaiting dispatch supervisor approval.', '2026-07-15T04:30:00Z');
end;
$$;

create or replace function public.demo_load_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_users jsonb;
  v_products jsonb;
  v_inventory jsonb;
  v_dispatches jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id::text,
        'name', full_name,
        'role', role::text,
        'department', department
      )
      order by created_at
    ),
    '[]'::jsonb
  )
  into v_users
  from user_profiles
  where active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', code,
        'name', name,
        'productType', product_type::text,
        'unit', unit::text,
        'gsm', gsm,
        'grade', grade,
        'shade', shade,
        'size', size
      )
      order by code
    ),
    '[]'::jsonb
  )
  into v_products
  from products
  where active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id::text,
        'batchNo', b.batch_no,
        'productCode', b.product_code,
        'productName', p.name,
        'productType', p.product_type::text,
        'unit', p.unit::text,
        'onHandQty', b.on_hand_qty::float8,
        'reservedQty', b.reserved_qty::float8,
        'qualityStatus', b.quality_status::text,
        'location', b.location,
        'gsm', p.gsm,
        'grade', p.grade,
        'shade', p.shade,
        'size', p.size,
        'producedOn', b.produced_on::text
      )
      order by b.produced_on, b.batch_no
    ),
    '[]'::jsonb
  )
  into v_inventory
  from inventory_batches b
  join products p on p.code = b.product_code;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id::text,
        'requestNo', d.request_no,
        'customerName', d.customer_name,
        'customerType', d.customer_type::text,
        'destination', d.destination,
        'status', d.status::text,
        'controlStatus', d.control_status::text,
        'priority', d.priority::text,
        'createdAt', d.created_at,
        'requestedDispatchDate', d.requested_dispatch_date::text,
        'createdBy', d.created_by_name,
        'approvedBy', d.approved_by_name,
        'lines', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', l.id::text,
              'productCode', l.product_code,
              'productName', p.name,
              'productType', l.product_type::text,
              'unit', l.unit::text,
              'requestedQty', l.requested_qty::float8,
              'reservedBatchIds', coalesce((
                select jsonb_agg(r.inventory_batch_id::text order by r.reserved_at)
                from inventory_reservations r
                where r.dispatch_line_id = l.id
                  and r.deducted_at is null
              ), '[]'::jsonb)
            )
            order by l.created_at
          )
          from dispatch_lines l
          join products p on p.code = l.product_code
          where l.dispatch_id = d.id
        ), '[]'::jsonb),
        'vehicle', (
          select jsonb_build_object(
            'vehicleNo', v.vehicle_no,
            'transporter', v.transporter,
            'driverName', v.driver_name,
            'driverPhone', v.driver_phone,
            'expectedArrival', v.expected_arrival
          )
          from vehicle_assignments v
          where v.dispatch_id = d.id
        ),
        'documents', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'type', doc.document_type::text,
              'present', doc.present,
              'verified', doc.verified
            )
            order by doc.document_type::text
          )
          from dispatch_documents doc
          where doc.dispatch_id = d.id
        ), '[]'::jsonb),
        'expectedWeightKg', d.expected_weight_kg::float8,
        'actualWeightKg', d.actual_weight_kg::float8,
        'weightTolerancePercent', d.weight_tolerance_percent::float8,
        'exceptions', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', e.id::text,
              'dispatchId', e.dispatch_id::text,
              'code', e.code,
              'message', e.message,
              'severity', e.severity::text,
              'controlStatus', e.control_status::text,
              'createdAt', e.created_at,
              'resolvedAt', e.resolved_at
            )
            order by e.created_at
          )
          from dispatch_exceptions e
          where e.dispatch_id = d.id
        ), '[]'::jsonb),
        'audit', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', a.id::text,
              'dispatchId', a.dispatch_id::text,
              'at', a.created_at,
              'actor', a.actor_name,
              'role', a.actor_role::text,
              'action', a.action,
              'fromStatus', a.from_status::text,
              'toStatus', a.to_status::text,
              'note', a.note
            )
            order by a.created_at
          )
          from audit_logs a
          where a.dispatch_id = d.id
        ), '[]'::jsonb)
      )
      order by d.created_at desc
    ),
    '[]'::jsonb
  )
  into v_dispatches
  from dispatch_requests d;

  return jsonb_build_object(
    'users', v_users,
    'products', v_products,
    'inventory', v_inventory,
    'dispatches', v_dispatches
  );
end;
$$;

create or replace function public.demo_refresh_control_status(p_dispatch_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update dispatch_requests
  set control_status = case
    when exists (
      select 1
      from dispatch_exceptions
      where dispatch_id = p_dispatch_id
        and resolved_at is null
        and control_status = 'BLOCKED'
    ) then 'BLOCKED'::control_status
    when exists (
      select 1
      from dispatch_exceptions
      where dispatch_id = p_dispatch_id
        and resolved_at is null
    ) then 'WARNING'::control_status
    else 'CLEAR'::control_status
  end
  where id = p_dispatch_id;
$$;

create or replace function public.demo_action_allowed(p_actor_role public.app_role, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_action = 'SUBMIT_FOR_APPROVAL' then p_actor_role in ('DISPATCH_CLERK', 'MANAGER_ADMIN')
    when p_action = 'APPROVE_AND_RESERVE' then p_actor_role in ('DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    when p_action = 'REJECT' then p_actor_role in ('DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    when p_action = 'ASSIGN_VEHICLE' then p_actor_role in ('DISPATCH_CLERK', 'DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    when p_action = 'MARK_VEHICLE_ARRIVED' then p_actor_role in ('GATE_SECURITY', 'MANAGER_ADMIN')
    when p_action = 'START_LOADING' then p_actor_role in ('WAREHOUSE_QUALITY', 'MANAGER_ADMIN')
    when p_action = 'COMPLETE_LOADING' then p_actor_role in ('WAREHOUSE_QUALITY', 'MANAGER_ADMIN')
    when p_action = 'VERIFY_WEIGHT' then p_actor_role in ('WAREHOUSE_QUALITY', 'MANAGER_ADMIN')
    when p_action = 'VERIFY_DOCUMENTS' then p_actor_role in ('DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    when p_action = 'CLEAR_GATE' then p_actor_role in ('GATE_SECURITY', 'MANAGER_ADMIN')
    when p_action = 'CONFIRM_EXIT' then p_actor_role in ('GATE_SECURITY', 'MANAGER_ADMIN')
    when p_action = 'RESOLVE_EXCEPTION' then p_actor_role = 'MANAGER_ADMIN'
    when p_action = 'CANCEL' then p_actor_role in ('DISPATCH_SUPERVISOR', 'MANAGER_ADMIN')
    else false
  end;
$$;

create or replace function public.demo_record_n8n_feedback(p_dispatch_id uuid, p_n8n_result jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_n8n_result->'exceptions', '[]'::jsonb))
  loop
    insert into dispatch_exceptions (dispatch_id, code, message, severity, control_status)
    values (
      p_dispatch_id,
      coalesce(v_item->>'code', 'N8N_EXCEPTION'),
      coalesce(v_item->>'message', 'n8n blocked this workflow action.'),
      coalesce(nullif(v_item->>'severity', ''), 'HIGH')::exception_severity,
      coalesce(nullif(v_item->>'controlStatus', ''), 'BLOCKED')::control_status
    );
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_n8n_result->'warnings', '[]'::jsonb))
  loop
    insert into dispatch_exceptions (dispatch_id, code, message, severity, control_status)
    values (
      p_dispatch_id,
      coalesce(v_item->>'code', 'N8N_WARNING'),
      coalesce(v_item->>'message', 'n8n returned a workflow warning.'),
      'LOW',
      'WARNING'
    );
  end loop;
end;
$$;

create or replace function public.demo_create_dispatch(
  p_actor_name text,
  p_actor_role public.app_role,
  p_customer_name text,
  p_customer_type public.customer_type,
  p_destination text,
  p_priority public.dispatch_priority,
  p_product_code text,
  p_requested_qty numeric,
  p_requested_dispatch_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch_id uuid := gen_random_uuid();
  v_line_id uuid := gen_random_uuid();
  v_product products%rowtype;
  v_sequence integer;
  v_request_no text;
begin
  if not public.demo_action_allowed(p_actor_role, 'SUBMIT_FOR_APPROVAL') then
    return jsonb_build_object(
      'state', public.demo_load_state(),
      'dispatchId', '',
      'message', p_actor_role::text || ' cannot create dispatch requests.'
    );
  end if;

  select * into v_product
  from products
  where code = p_product_code
    and active = true;

  if not found then
    return jsonb_build_object(
      'state', public.demo_load_state(),
      'dispatchId', '',
      'message', 'Product was not found.'
    );
  end if;

  select count(*) + 1 into v_sequence from dispatch_requests;
  v_request_no := 'FGD-2026-0715-' || lpad(v_sequence::text, 3, '0');

  insert into dispatch_requests (
    id, request_no, customer_name, customer_type, destination, status, control_status,
    priority, requested_dispatch_date, created_by_name, weight_tolerance_percent,
    expected_weight_kg
  )
  values (
    v_dispatch_id,
    v_request_no,
    nullif(trim(p_customer_name), ''),
    p_customer_type,
    nullif(trim(p_destination), ''),
    'DRAFT',
    'CLEAR',
    p_priority,
    p_requested_dispatch_date,
    p_actor_name,
    1.5,
    case when v_product.unit = 'KG' then p_requested_qty else 0 end
  );

  insert into dispatch_lines (
    id, dispatch_id, product_code, product_type, unit, requested_qty
  )
  values (
    v_line_id,
    v_dispatch_id,
    v_product.code,
    v_product.product_type,
    v_product.unit,
    p_requested_qty
  );

  insert into dispatch_documents (dispatch_id, document_type, present, verified)
  select v_dispatch_id, doc_type::document_type, true, false
  from unnest(array[
    'COMMERCIAL_INVOICE',
    'DELIVERY_CHALLAN',
    'PACKING_LIST',
    'GATE_PASS'
  ]) as required_docs(doc_type);

  insert into audit_logs (dispatch_id, actor_name, actor_role, action, from_status, to_status, note)
  values (v_dispatch_id, p_actor_name, p_actor_role, 'CREATED', null, 'DRAFT', 'Dispatch request created.');

  return jsonb_build_object(
    'state', public.demo_load_state(),
    'dispatchId', v_dispatch_id::text,
    'message', v_request_no || ' created as draft.'
  );
end;
$$;

create or replace function public.demo_apply_workflow_action(
  p_dispatch_id uuid,
  p_actor_name text,
  p_actor_role public.app_role,
  p_action text,
  p_n8n_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.workflow_status;
  v_to public.workflow_status;
  v_message text := replace(initcap(replace(p_action, '_', ' ')), ' And ', ' and ') || ' completed.';
  v_note text := coalesce(p_n8n_result->>'uiMessage', v_message);
  v_ok boolean := coalesce((p_n8n_result->>'ok')::boolean, true);
  v_reservation jsonb;
  v_batch jsonb;
  v_line_id uuid;
  v_batch_id uuid;
  v_qty numeric;
  v_expected numeric;
begin
  select status into v_from
  from dispatch_requests
  where id = p_dispatch_id
  for update;

  if not found then
    return jsonb_build_object(
      'state', public.demo_load_state(),
      'dispatchId', p_dispatch_id::text,
      'message', 'Dispatch was not found.'
    );
  end if;

  if not public.demo_action_allowed(p_actor_role, p_action) then
    return jsonb_build_object(
      'state', public.demo_load_state(),
      'dispatchId', p_dispatch_id::text,
      'message', p_actor_role::text || ' cannot perform ' || p_action || '.'
    );
  end if;

  perform public.demo_record_n8n_feedback(p_dispatch_id, p_n8n_result);

  if not v_ok then
    perform public.demo_refresh_control_status(p_dispatch_id);

    insert into audit_logs (dispatch_id, actor_name, actor_role, action, from_status, to_status, note)
    values (p_dispatch_id, p_actor_name, p_actor_role, p_action, v_from, v_from, v_note);

    return jsonb_build_object(
      'state', public.demo_load_state(),
      'dispatchId', p_dispatch_id::text,
      'message', v_note
    );
  end if;

  if p_action = 'SUBMIT_FOR_APPROVAL' then
    v_to := 'AWAITING_APPROVAL';
    v_note := 'Stock and quality validation passed. Awaiting approval.';
  elsif p_action = 'APPROVE_AND_RESERVE' then
    v_to := 'APPROVED';
    update dispatch_requests
    set approved_by_name = p_actor_name
    where id = p_dispatch_id;

    for v_reservation in
      select value
      from jsonb_array_elements(coalesce(p_n8n_result->'reservations', '[]'::jsonb))
    loop
      v_line_id := nullif(v_reservation->>'lineId', '')::uuid;

      for v_batch in
        select value
        from jsonb_array_elements(coalesce(v_reservation->'batches', '[]'::jsonb))
      loop
        v_batch_id := nullif(v_batch->>'batchId', '')::uuid;
        v_qty := coalesce(nullif(v_batch->>'qty', '')::numeric, 0);

        if v_line_id is not null and v_batch_id is not null and v_qty > 0 then
          insert into inventory_reservations (dispatch_line_id, inventory_batch_id, reserved_qty)
          values (v_line_id, v_batch_id, v_qty)
          on conflict (dispatch_line_id, inventory_batch_id)
          do update set reserved_qty = excluded.reserved_qty;

          update inventory_batches
          set reserved_qty = least(on_hand_qty, reserved_qty + v_qty)
          where id = v_batch_id;
        end if;
      end loop;
    end loop;

    v_note := 'Approved and released inventory reserved by FIFO.';
  elsif p_action = 'REJECT' then
    v_to := 'REJECTED';
    insert into dispatch_exceptions (dispatch_id, code, message, severity, control_status)
    values (p_dispatch_id, 'MANUAL_REJECTION', 'Rejected by dispatch supervisor.', 'HIGH', 'BLOCKED');
    v_note := 'Rejected by approver.';
  elsif p_action = 'ASSIGN_VEHICLE' then
    v_to := 'VEHICLE_ASSIGNED';
    insert into vehicle_assignments (
      dispatch_id, vehicle_no, transporter, driver_name, driver_phone, expected_arrival
    )
    values (
      p_dispatch_id,
      'Bagmati 03-001 Kha 7821',
      'Koshi Freight Service',
      'Nabin Shrestha',
      '9801234567',
      now() + interval '1 hour'
    )
    on conflict (dispatch_id)
    do update set
      vehicle_no = excluded.vehicle_no,
      transporter = excluded.transporter,
      driver_name = excluded.driver_name,
      driver_phone = excluded.driver_phone,
      expected_arrival = excluded.expected_arrival;
    v_note := 'Vehicle and driver assigned.';
  elsif p_action = 'MARK_VEHICLE_ARRIVED' then
    v_to := 'VEHICLE_ARRIVED';
    update vehicle_assignments
    set arrival_recorded_at = now()
    where dispatch_id = p_dispatch_id;
    v_note := 'Vehicle arrival recorded by gate security.';
  elsif p_action = 'START_LOADING' then
    v_to := 'LOADING';
    v_note := 'Loading started by warehouse team.';
  elsif p_action = 'COMPLETE_LOADING' then
    v_to := 'AWAITING_WEIGHT_CHECK';
    select coalesce(sum(requested_qty), 0) into v_expected
    from dispatch_lines
    where dispatch_id = p_dispatch_id
      and unit = 'KG';
    update dispatch_requests
    set expected_weight_kg = nullif(v_expected, 0)
    where id = p_dispatch_id
      and expected_weight_kg is null;
    v_note := 'Loading completed. Weight verification required.';
  elsif p_action = 'VERIFY_WEIGHT' then
    v_to := 'AWAITING_DOCUMENT_CHECK';
    update dispatch_requests
    set actual_weight_kg = coalesce(
      actual_weight_kg,
      case
        when expected_weight_kg is null or expected_weight_kg = 0 then 0
        else round(expected_weight_kg * 1.006, 2)
      end
    )
    where id = p_dispatch_id;
    v_note := 'Weight verified within tolerance.';
  elsif p_action = 'VERIFY_DOCUMENTS' then
    v_to := 'AWAITING_GATE_CLEARANCE';
    update dispatch_documents
    set verified = true,
      verified_by_name = p_actor_name,
      verified_at = now()
    where dispatch_id = p_dispatch_id
      and present = true;
    v_note := 'All dispatch documents verified.';
  elsif p_action = 'CLEAR_GATE' then
    v_to := 'CLEARED_FOR_EXIT';
    v_note := 'Gate clearance granted.';
  elsif p_action = 'CONFIRM_EXIT' then
    v_to := 'DISPATCHED';

    update inventory_batches b
    set
      on_hand_qty = greatest(b.on_hand_qty - r.reserved_qty, 0),
      reserved_qty = greatest(b.reserved_qty - r.reserved_qty, 0)
    from inventory_reservations r
    join dispatch_lines l on l.id = r.dispatch_line_id
    where r.inventory_batch_id = b.id
      and l.dispatch_id = p_dispatch_id
      and r.deducted_at is null;

    update inventory_reservations r
    set deducted_at = now()
    from dispatch_lines l
    where l.id = r.dispatch_line_id
      and l.dispatch_id = p_dispatch_id
      and r.deducted_at is null;

    v_note := 'Vehicle exit confirmed. Reserved inventory deducted.';
  elsif p_action = 'RESOLVE_EXCEPTION' then
    update dispatch_exceptions
    set resolved_at = coalesce(resolved_at, now())
    where dispatch_id = p_dispatch_id
      and resolved_at is null;

    if v_from = 'AWAITING_WEIGHT_CHECK' then
      v_to := 'AWAITING_DOCUMENT_CHECK';
    elsif v_from = 'AWAITING_DOCUMENT_CHECK' then
      v_to := 'AWAITING_GATE_CLEARANCE';
      update dispatch_documents
      set present = true,
        verified = true,
        verified_by_name = p_actor_name,
        verified_at = now()
      where dispatch_id = p_dispatch_id;
    elsif v_from = 'REJECTED' then
      v_to := 'AWAITING_APPROVAL';
    else
      v_to := v_from;
    end if;

    v_note := 'Exception resolved by manager/admin.';
  elsif p_action = 'CANCEL' then
    v_to := 'CANCELLED';
    insert into dispatch_exceptions (dispatch_id, code, message, severity, control_status)
    values (p_dispatch_id, 'CANCELLED_BY_USER', 'Dispatch cancelled before factory exit.', 'HIGH', 'BLOCKED');
    v_note := 'Dispatch cancelled before exit.';
  else
    v_to := v_from;
    v_note := 'Action recorded.';
  end if;

  update dispatch_requests
  set status = v_to
  where id = p_dispatch_id;

  perform public.demo_refresh_control_status(p_dispatch_id);

  insert into audit_logs (dispatch_id, actor_name, actor_role, action, from_status, to_status, note)
  values (p_dispatch_id, p_actor_name, p_actor_role, p_action, v_from, v_to, v_note);

  return jsonb_build_object(
    'state', public.demo_load_state(),
    'dispatchId', p_dispatch_id::text,
    'message', v_note
  );
end;
$$;

create or replace function public.demo_reset_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.demo_seed_dispatch_control();
  return jsonb_build_object(
    'state', public.demo_load_state(),
    'dispatchId', '44444444-4444-4444-4444-444444444006',
    'message', 'Supabase demo data reset to prepared scenarios.'
  );
end;
$$;

revoke all on function public.demo_seed_dispatch_control() from public;
revoke all on function public.demo_load_state() from public;
revoke all on function public.demo_refresh_control_status(uuid) from public;
revoke all on function public.demo_action_allowed(public.app_role, text) from public;
revoke all on function public.demo_record_n8n_feedback(uuid, jsonb) from public;
revoke all on function public.demo_create_dispatch(text, public.app_role, text, public.customer_type, text, public.dispatch_priority, text, numeric, date) from public;
revoke all on function public.demo_apply_workflow_action(uuid, text, public.app_role, text, jsonb) from public;
revoke all on function public.demo_reset_state() from public;

grant execute on function public.demo_load_state() to anon, authenticated;
grant execute on function public.demo_create_dispatch(text, public.app_role, text, public.customer_type, text, public.dispatch_priority, text, numeric, date) to anon, authenticated;
grant execute on function public.demo_apply_workflow_action(uuid, text, public.app_role, text, jsonb) to anon, authenticated;
grant execute on function public.demo_reset_state() to anon, authenticated;

select public.demo_seed_dispatch_control();
