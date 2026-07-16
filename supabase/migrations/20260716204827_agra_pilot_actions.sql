create or replace function public.agra_execute_action(
  p_request_id uuid,
  p_action text,
  p_order_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor public.agra_profiles%rowtype;
  v_order public.agra_orders%rowtype;
  v_product public.agra_products%rowtype;
  v_batch public.agra_inventory_batches%rowtype;
  v_rework public.agra_rework_records%rowtype;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_response jsonb;
  v_existing jsonb;
  v_entity_type text := 'ORDER';
  v_entity_id uuid := p_order_id;
  v_previous_status text;
  v_new_status text;
  v_error_code text;
  v_error_message text;
  v_order_no text;
  v_new_id uuid;
  v_item jsonb;
  v_item_row record;
  v_res record;
  v_doc jsonb;
  v_available numeric;
  v_remaining numeric;
  v_allocate numeric;
  v_move numeric;
  v_picked numeric;
  v_packed numeric;
  v_affected numeric;
  v_result text;
  v_count integer := 0;
  v_quantity_changes jsonb := '[]'::jsonb;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A unique request ID is required.';
  end if;

  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Sign in is required.';
  end if;

  select * into v_actor
  from public.agra_profiles
  where user_id = (select auth.uid()) and active
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'No active Agra role is assigned to this account.';
  end if;

  select response into v_existing
  from public.agra_action_requests
  where request_id = p_request_id and organization_id = v_actor.organization_id;

  if found then
    return coalesce(v_existing, jsonb_build_object('ok', false, 'code', 'REQUEST_PROCESSING', 'message', 'This request is still processing.'))
      || jsonb_build_object('idempotentReplay', true);
  end if;

  insert into public.agra_action_requests
    (request_id, organization_id, actor_id, action, entity_type, entity_id)
  values
    (p_request_id, v_actor.organization_id, v_actor.user_id, v_action, v_entity_type, v_entity_id);

  begin
    if v_action = 'CREATE_CUSTOMER' then
      if v_actor.role <> all(array['SALES_ORDER_COORDINATOR', 'MANAGER_ADMIN']) then
        raise exception using errcode = '42501', message = 'Sales or manager access is required.';
      end if;
      v_entity_type := 'CUSTOMER';
      v_new_id := gen_random_uuid();
      insert into public.agra_customers
        (id, organization_id, customer_code, name, customer_type, contact_name, phone, email, address)
      values
        (v_new_id, v_actor.organization_id,
         coalesce(nullif(btrim(p_payload->>'customerCode'), ''), 'CUS-' || upper(substr(replace(v_new_id::text, '-', ''), 1, 6))),
         nullif(btrim(p_payload->>'name'), ''),
         coalesce(nullif(p_payload->>'customerType', ''), 'BUSINESS'),
         nullif(btrim(p_payload->>'contactName'), ''),
         nullif(btrim(p_payload->>'phone'), ''),
         nullif(btrim(p_payload->>'email'), ''),
         nullif(btrim(p_payload->>'address'), ''));
      v_entity_id := v_new_id;
      v_response := jsonb_build_object('ok', true, 'code', 'CUSTOMER_CREATED', 'message', 'Customer created.', 'entityId', v_new_id);

    elsif v_action = 'CREATE_PRODUCT' then
      if v_actor.role <> all(array['INVENTORY_QUALITY', 'MANAGER_ADMIN']) then
        raise exception using errcode = '42501', message = 'Inventory or manager access is required.';
      end if;
      v_entity_type := 'PRODUCT';
      v_new_id := gen_random_uuid();
      insert into public.agra_products
        (id, organization_id, sku, name, category, description, size, colour, design, material, paper_type, pages,
         packaging_specification, custom_branding_capable, primary_unit, standard_package_quantity, minimum_stock_level)
      values
        (v_new_id, v_actor.organization_id, upper(btrim(p_payload->>'sku')), nullif(btrim(p_payload->>'name'), ''),
         p_payload->>'category', nullif(btrim(p_payload->>'description'), ''), nullif(btrim(p_payload->>'size'), ''),
         nullif(btrim(p_payload->>'colour'), ''), nullif(btrim(p_payload->>'design'), ''), nullif(btrim(p_payload->>'material'), ''),
         nullif(btrim(p_payload->>'paperType'), ''), nullif(p_payload->>'pages', '')::integer,
         nullif(btrim(p_payload->>'packagingSpecification'), ''), coalesce((p_payload->>'customBrandingCapable')::boolean, false),
         p_payload->>'primaryUnit', coalesce(nullif(p_payload->>'standardPackageQuantity', '')::numeric, 1),
         coalesce(nullif(p_payload->>'minimumStockLevel', '')::numeric, 0));
      v_entity_id := v_new_id;
      v_response := jsonb_build_object('ok', true, 'code', 'PRODUCT_CREATED', 'message', 'Product added.', 'entityId', v_new_id);

    elsif v_action = 'RECEIVE_BATCH' then
      if v_actor.role <> all(array['INVENTORY_QUALITY', 'MANAGER_ADMIN']) then
        raise exception using errcode = '42501', message = 'Inventory or manager access is required.';
      end if;
      v_entity_type := 'INVENTORY_BATCH';
      select * into v_product from public.agra_products
      where id = (p_payload->>'productId')::uuid and organization_id = v_actor.organization_id and active;
      if not found then
        raise exception using errcode = '22023', message = 'Select an active product.';
      end if;
      v_available := (p_payload->>'quantity')::numeric;
      if v_available <= 0 then
        raise exception using errcode = '22023', message = 'Batch quantity must be above zero.';
      end if;
      v_new_id := gen_random_uuid();
      insert into public.agra_inventory_batches
        (id, organization_id, product_id, batch_no, production_date, qc_status, storage_location, shelf_reference,
         physical_quantity, pending_quantity, unit, notes)
      values
        (v_new_id, v_actor.organization_id, v_product.id, upper(btrim(p_payload->>'batchNo')),
         nullif(p_payload->>'productionDate', '')::date, 'PENDING_QC', nullif(btrim(p_payload->>'storageLocation'), ''),
         nullif(btrim(p_payload->>'shelfReference'), ''), v_available, v_available, v_product.primary_unit,
         nullif(btrim(p_payload->>'notes'), ''));
      v_entity_id := v_new_id;
      v_quantity_changes := jsonb_build_array(jsonb_build_object('productId', v_product.id, 'pending', v_available, 'unit', v_product.primary_unit));
      v_response := jsonb_build_object('ok', true, 'code', 'BATCH_RECEIVED', 'message', 'Batch received and sent to quality check.', 'entityId', v_new_id);

    elsif v_action = 'INSPECT_BATCH' then
      if v_actor.role <> all(array['INVENTORY_QUALITY', 'MANAGER_ADMIN']) then
        raise exception using errcode = '42501', message = 'Quality or manager access is required.';
      end if;
      v_entity_type := 'INVENTORY_BATCH';
      v_entity_id := (p_payload->>'batchId')::uuid;
      select * into v_batch from public.agra_inventory_batches
      where id = v_entity_id and organization_id = v_actor.organization_id
      for update;
      if not found or v_batch.pending_quantity <= 0 then
        raise exception using errcode = 'P1002', message = 'This batch has no quantity awaiting quality check.';
      end if;
      v_result := upper(p_payload->>'result');
      if v_result = 'RELEASED' then
        update public.agra_inventory_batches
        set released_quantity = released_quantity + pending_quantity,
            pending_quantity = 0, qc_status = 'RELEASED', qc_release_date = current_date,
            notes = coalesce(nullif(btrim(p_payload->>'notes'), ''), notes), updated_at = now()
        where id = v_batch.id;
      elsif v_result = 'REWORK_REQUIRED' then
        update public.agra_inventory_batches
        set rework_quantity = rework_quantity + pending_quantity,
            pending_quantity = 0, qc_status = 'REWORK_REQUIRED', updated_at = now()
        where id = v_batch.id;
      elsif v_result = 'BLOCKED' then
        update public.agra_inventory_batches
        set blocked_quantity = blocked_quantity + pending_quantity,
            pending_quantity = 0, qc_status = 'BLOCKED', updated_at = now()
        where id = v_batch.id;
      elsif v_result = 'DAMAGED' then
        update public.agra_inventory_batches
        set damaged_quantity = damaged_quantity + pending_quantity,
            pending_quantity = 0, qc_status = 'DAMAGED', updated_at = now()
        where id = v_batch.id;
      else
        raise exception using errcode = '22023', message = 'Choose a valid quality result.';
      end if;
      v_quantity_changes := jsonb_build_array(jsonb_build_object('batchId', v_batch.id, 'quantity', v_batch.pending_quantity, 'result', v_result));
      v_response := jsonb_build_object('ok', true, 'code', 'BATCH_QC_RECORDED', 'message', 'Batch quality result recorded.', 'entityId', v_batch.id);

    elsif v_action = 'UPDATE_PROFILE' then
      if v_actor.role <> 'MANAGER_ADMIN' then
        raise exception using errcode = '42501', message = 'Manager access is required.';
      end if;
      v_entity_type := 'PROFILE';
      v_entity_id := (p_payload->>'profileId')::uuid;
      update public.agra_profiles
      set full_name = coalesce(nullif(btrim(p_payload->>'fullName'), ''), full_name),
          role = coalesce(nullif(p_payload->>'role', ''), role),
          department = coalesce(nullif(btrim(p_payload->>'department'), ''), department),
          active = coalesce((p_payload->>'active')::boolean, active),
          updated_at = now()
      where id = v_entity_id and organization_id = v_actor.organization_id;
      if not found then
        raise exception using errcode = '22023', message = 'User profile was not found.';
      end if;
      v_response := jsonb_build_object('ok', true, 'code', 'PROFILE_UPDATED', 'message', 'User access updated.', 'entityId', v_entity_id);

    elsif v_action = 'CREATE_ORDER' then
      if v_actor.role <> all(array['SALES_ORDER_COORDINATOR', 'MANAGER_ADMIN']) then
        raise exception using errcode = '42501', message = 'Sales or manager access is required.';
      end if;
      if not exists (
        select 1 from public.agra_customers
        where id = (p_payload->>'customerId')::uuid and organization_id = v_actor.organization_id and active
      ) then
        raise exception using errcode = '22023', message = 'Select an active customer.';
      end if;
      if jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') = 0 then
        raise exception using errcode = '22023', message = 'Add at least one order item.';
      end if;
      v_new_id := gen_random_uuid();
      v_order_no := 'AGRA-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.agra_order_number_seq')::text, 5, '0');
      insert into public.agra_orders
        (id, organization_id, order_no, customer_id, customer_order_reference, fulfillment_source, priority,
         requested_dispatch_date, delivery_deadline, is_custom_order, customization_summary, requested_colour,
         requested_dimensions, logo_or_branding_required, print_text, customer_specification_confirmed,
         sample_approval_required, sample_approved, special_packaging_instructions, notes, created_by)
      values
        (v_new_id, v_actor.organization_id, v_order_no, (p_payload->>'customerId')::uuid,
         nullif(btrim(p_payload->>'customerOrderReference'), ''),
         coalesce(nullif(p_payload->>'fulfillmentSource', ''), 'FINISHED_STOCK'),
         coalesce(nullif(p_payload->>'priority', ''), 'NORMAL'),
         (p_payload->>'requestedDispatchDate')::date, nullif(p_payload->>'deliveryDeadline', '')::date,
         coalesce((p_payload->>'isCustomOrder')::boolean, false), nullif(btrim(p_payload->>'customizationSummary'), ''),
         nullif(btrim(p_payload->>'requestedColour'), ''), nullif(btrim(p_payload->>'requestedDimensions'), ''),
         coalesce((p_payload->>'logoOrBrandingRequired')::boolean, false), nullif(btrim(p_payload->>'printText'), ''),
         coalesce((p_payload->>'customerSpecificationConfirmed')::boolean, false),
         coalesce((p_payload->>'sampleApprovalRequired')::boolean, false),
         coalesce((p_payload->>'sampleApproved')::boolean, false),
         nullif(btrim(p_payload->>'specialPackagingInstructions'), ''), nullif(btrim(p_payload->>'notes'), ''), v_actor.user_id);

      for v_item in select value from jsonb_array_elements(p_payload->'items') loop
        select * into v_product from public.agra_products
        where id = (v_item->>'productId')::uuid and organization_id = v_actor.organization_id and active;
        if not found then
          raise exception using errcode = '22023', message = 'An order item uses an unavailable product.';
        end if;
        if coalesce(nullif(v_item->>'quantity', '')::numeric, 0) <= 0 then
          raise exception using errcode = '22023', message = 'Every order quantity must be above zero.';
        end if;
        insert into public.agra_order_items
          (organization_id, order_id, product_id, requested_quantity, unit, customization, notes)
        values
          (v_actor.organization_id, v_new_id, v_product.id, (v_item->>'quantity')::numeric, v_product.primary_unit,
           coalesce(v_item->'customization', '{}'::jsonb), nullif(btrim(v_item->>'notes'), ''));
      end loop;

      insert into public.agra_documents (organization_id, order_id, document_type, reference_number, required, status)
      values
        (v_actor.organization_id, v_new_id, 'CUSTOMER_ORDER', nullif(btrim(p_payload->>'customerOrderReference'), ''), false,
         case when nullif(btrim(p_payload->>'customerOrderReference'), '') is null then 'MISSING' else 'PRESENT' end),
        (v_actor.organization_id, v_new_id, 'INVOICE', null, true, 'MISSING'),
        (v_actor.organization_id, v_new_id, 'PACKING_LIST', null, true, 'MISSING'),
        (v_actor.organization_id, v_new_id, 'DISPATCH_NOTE', null, true, 'MISSING');

      v_entity_id := v_new_id;
      v_new_status := 'DRAFT';
      v_response := jsonb_build_object('ok', true, 'code', 'ORDER_CREATED', 'message', 'Order draft created.', 'entityId', v_new_id, 'orderNo', v_order_no, 'newStatus', v_new_status);

    elsif v_action = 'RESET_DEMO' then
      if v_actor.role <> 'MANAGER_ADMIN' then
        raise exception using errcode = '42501', message = 'Manager access is required.';
      end if;
      v_entity_type := 'DATASET';
      v_entity_id := null;
      perform private.agra_seed_demo_data();
      update public.agra_demo_state
      set last_reset_at = now(), last_reset_by = v_actor.user_id
      where organization_id = v_actor.organization_id;
      v_response := jsonb_build_object('ok', true, 'code', 'DEMO_RESET', 'message', 'Demo data restored.', 'datasetVersion', '2026-07-17.agra-pilot.v1');

    else
      select * into v_order
      from public.agra_orders
      where id = p_order_id and organization_id = v_actor.organization_id
      for update;
      if not found then
        raise exception using errcode = '22023', message = 'Order was not found.';
      end if;
      v_previous_status := v_order.fulfillment_status;
      v_entity_id := v_order.id;

      if v_action = 'UPDATE_DRAFT_ORDER' then
        if v_actor.role <> all(array['SALES_ORDER_COORDINATOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Sales or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'DRAFT' then
          raise exception using errcode = 'P1002', message = 'Only draft orders can be edited.';
        end if;
        update public.agra_orders
        set customer_order_reference = coalesce(nullif(btrim(p_payload->>'customerOrderReference'), ''), customer_order_reference),
            priority = coalesce(nullif(p_payload->>'priority', ''), priority),
            requested_dispatch_date = coalesce(nullif(p_payload->>'requestedDispatchDate', '')::date, requested_dispatch_date),
            delivery_deadline = coalesce(nullif(p_payload->>'deliveryDeadline', '')::date, delivery_deadline),
            customization_summary = coalesce(nullif(btrim(p_payload->>'customizationSummary'), ''), customization_summary),
            special_packaging_instructions = coalesce(nullif(btrim(p_payload->>'specialPackagingInstructions'), ''), special_packaging_instructions),
            notes = coalesce(nullif(btrim(p_payload->>'notes'), ''), notes), updated_at = now()
        where id = v_order.id;
        v_new_status := 'DRAFT';
        v_response := jsonb_build_object('ok', true, 'code', 'DRAFT_UPDATED', 'message', 'Draft order updated.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'SUBMIT_ORDER' then
        if v_actor.role <> all(array['SALES_ORDER_COORDINATOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Sales or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'DRAFT' then
          raise exception using errcode = 'P1002', message = 'Only a draft order can be submitted.';
        end if;
        update public.agra_orders set order_status = 'CONFIRMED', fulfillment_status = 'AWAITING_STOCK_CHECK', updated_at = now() where id = v_order.id;
        v_new_status := 'AWAITING_STOCK_CHECK';
        v_response := jsonb_build_object('ok', true, 'code', 'ORDER_SUBMITTED', 'message', 'Order sent for stock check.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'CHECK_STOCK' then
        if v_actor.role <> all(array['INVENTORY_QUALITY', 'OPERATIONS_SUPERVISOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Inventory, supervisor, or manager access is required.';
        end if;
        if v_order.fulfillment_status not in ('AWAITING_STOCK_CHECK', 'BLOCKED') then
          raise exception using errcode = 'P1002', message = 'This order is not waiting for a stock check.';
        end if;
        if v_order.fulfillment_source = 'PRODUCTION_REQUIRED' then
          update public.agra_orders set fulfillment_status = 'AWAITING_PRODUCTION', updated_at = now() where id = v_order.id;
          v_new_status := 'AWAITING_PRODUCTION';
        else
          for v_item_row in
            select oi.*, p.name as product_name
            from public.agra_order_items oi join public.agra_products p on p.id = oi.product_id
            where oi.order_id = v_order.id
          loop
            select coalesce(sum(available_quantity), 0) into v_available
            from public.agra_inventory_batches
            where organization_id = v_actor.organization_id and product_id = v_item_row.product_id
              and qc_status = 'RELEASED' and unit = v_item_row.unit and available_quantity > 0;
            if v_available < v_item_row.requested_quantity then
              raise exception using errcode = 'P1001',
                message = format('%s needs %s %s, but only %s is released and available.', v_item_row.product_name, v_item_row.requested_quantity, v_item_row.unit, v_available);
            end if;
          end loop;
          update public.agra_orders set fulfillment_status = 'AWAITING_APPROVAL', updated_at = now() where id = v_order.id;
          v_new_status := 'AWAITING_APPROVAL';
        end if;
        v_response := jsonb_build_object('ok', true, 'code', 'STOCK_CHECK_PASSED', 'message', 'Stock check passed.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'RECORD_PRODUCTION' then
        if v_actor.role <> all(array['INVENTORY_QUALITY', 'OPERATIONS_SUPERVISOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Inventory, supervisor, or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'AWAITING_PRODUCTION' then
          raise exception using errcode = 'P1002', message = 'This order is not waiting for production.';
        end if;
        select sum(requested_quantity) into v_available from public.agra_order_items where order_id = v_order.id;
        update public.agra_orders
        set production_reference = nullif(btrim(p_payload->>'productionReference'), ''),
            expected_production_completion = nullif(p_payload->>'expectedCompletionDate', '')::date,
            production_completed_quantity = coalesce(nullif(p_payload->>'completedQuantity', '')::numeric, 0),
            production_completion_notes = nullif(btrim(p_payload->>'completionNotes'), ''),
            fulfillment_status = case when coalesce(nullif(p_payload->>'completedQuantity', '')::numeric, 0) >= v_available then 'AWAITING_APPROVAL' else 'AWAITING_PRODUCTION' end,
            updated_at = now()
        where id = v_order.id
        returning fulfillment_status into v_new_status;
        v_response := jsonb_build_object('ok', true, 'code', 'PRODUCTION_RECORDED', 'message', 'Production update recorded.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'APPROVE_ORDER' then
        if v_actor.role <> all(array['OPERATIONS_SUPERVISOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Supervisor or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'AWAITING_APPROVAL' then
          raise exception using errcode = 'P1002', message = 'This order is not waiting for approval.';
        end if;
        if exists (select 1 from public.agra_inventory_reservations where order_id = v_order.id and status = 'ACTIVE') then
          raise exception using errcode = 'P1002', message = 'This order already has active reservations.';
        end if;
        for v_item_row in select * from public.agra_order_items where order_id = v_order.id order by id loop
          v_remaining := v_item_row.requested_quantity;
          for v_batch in
            select * from public.agra_inventory_batches
            where organization_id = v_actor.organization_id and product_id = v_item_row.product_id
              and qc_status = 'RELEASED' and unit = v_item_row.unit and available_quantity > 0
            order by production_date nulls last, batch_no
            for update
          loop
            exit when v_remaining <= 0;
            v_allocate := least(v_remaining, v_batch.available_quantity);
            insert into public.agra_inventory_reservations
              (organization_id, order_id, order_item_id, inventory_batch_id, reserved_quantity, unit, status, request_id)
            values
              (v_actor.organization_id, v_order.id, v_item_row.id, v_batch.id, v_allocate, v_item_row.unit, 'ACTIVE', p_request_id);
            update public.agra_inventory_batches set reserved_quantity = reserved_quantity + v_allocate, updated_at = now() where id = v_batch.id;
            v_remaining := v_remaining - v_allocate;
            v_quantity_changes := v_quantity_changes || jsonb_build_array(jsonb_build_object('batchId', v_batch.id, 'reserved', v_allocate, 'unit', v_item_row.unit));
          end loop;
          if v_remaining > 0 then
            raise exception using errcode = 'P1001', message = format('Only %s %s remains available for this order line.', v_item_row.requested_quantity - v_remaining, v_item_row.unit);
          end if;
          update public.agra_order_items set approved_quantity = requested_quantity where id = v_item_row.id;
        end loop;
        update public.agra_orders
        set fulfillment_status = 'APPROVED', approved_by = v_actor.user_id, approved_at = now(), updated_at = now()
        where id = v_order.id;
        v_new_status := 'APPROVED';
        v_response := jsonb_build_object('ok', true, 'code', 'ORDER_APPROVED', 'message', 'Order approved and stock reserved.', 'entityId', v_order.id, 'newStatus', v_new_status, 'quantityChanges', v_quantity_changes);

      elsif v_action = 'START_PICKING' then
        if v_actor.role <> all(array['PACKING_DISPATCH', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Packing or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'APPROVED' then
          raise exception using errcode = 'P1002', message = 'Only an approved order can start picking.';
        end if;
        update public.agra_orders set fulfillment_status = 'PICKING', updated_at = now() where id = v_order.id;
        v_new_status := 'PICKING';
        v_response := jsonb_build_object('ok', true, 'code', 'PICKING_STARTED', 'message', 'Picking started.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'COMPLETE_PICKING' then
        if v_actor.role <> all(array['PACKING_DISPATCH', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Packing or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'PICKING' then
          raise exception using errcode = 'P1002', message = 'This order is not being picked.';
        end if;
        for v_res in
          select r.*, b.storage_location, b.shelf_reference
          from public.agra_inventory_reservations r join public.agra_inventory_batches b on b.id = r.inventory_batch_id
          where r.order_id = v_order.id and r.status = 'ACTIVE'
          order by r.reserved_at
        loop
          select coalesce((x->>'quantityPicked')::numeric, v_res.reserved_quantity) into v_picked
          from jsonb_array_elements(coalesce(p_payload->'picks', '[]'::jsonb)) x
          where x->>'reservationId' = v_res.id::text
          limit 1;
          v_picked := coalesce(v_picked, v_res.reserved_quantity);
          if v_picked <> v_res.reserved_quantity then
            raise exception using errcode = 'P1005', message = 'Picked quantities must match the approved reservation.';
          end if;
          insert into public.agra_pick_records
            (organization_id, order_id, order_item_id, inventory_batch_id, reservation_id, quantity_requested,
             quantity_picked, unit, picker_id, started_at, completed_at, discrepancy, notes)
          values
            (v_actor.organization_id, v_order.id, v_res.order_item_id, v_res.inventory_batch_id, v_res.id,
             v_res.reserved_quantity, v_picked, v_res.unit, v_actor.user_id,
             coalesce(nullif(p_payload->>'startedAt', '')::timestamptz, now()), now(), 0, nullif(btrim(p_payload->>'notes'), ''));
        end loop;
        update public.agra_orders set fulfillment_status = 'AWAITING_QC', updated_at = now() where id = v_order.id;
        v_new_status := 'AWAITING_QC';
        v_response := jsonb_build_object('ok', true, 'code', 'PICKING_COMPLETED', 'message', 'Picking completed. Quality check is next.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'RECORD_QC' then
        if v_actor.role <> all(array['INVENTORY_QUALITY', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Quality or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'AWAITING_QC' then
          raise exception using errcode = 'P1002', message = 'This order is not waiting for quality check.';
        end if;
        v_result := upper(coalesce(p_payload->>'result', 'PASSED'));
        if v_result not in ('PASSED', 'REWORK_REQUIRED', 'BLOCKED', 'DAMAGED') then
          raise exception using errcode = '22023', message = 'Choose a valid quality result.';
        end if;
        for v_item_row in
          select oi.*, p.category from public.agra_order_items oi join public.agra_products p on p.id = oi.product_id
          where oi.order_id = v_order.id
        loop
          v_affected := case when v_result = 'PASSED' then 0 else coalesce(nullif(p_payload->>'affectedQuantity', '')::numeric, v_item_row.approved_quantity) end;
          select inventory_batch_id into v_new_id
          from public.agra_inventory_reservations
          where order_item_id = v_item_row.id and status = 'ACTIVE'
          order by reserved_at limit 1;
          insert into public.agra_qc_inspections
            (organization_id, order_id, order_item_id, inventory_batch_id, product_category, inspected_quantity,
             passed_quantity, rework_quantity, blocked_quantity, damaged_quantity, result, checklist,
             defect_type, defect_description, inspected_by, notes)
          values
            (v_actor.organization_id, v_order.id, v_item_row.id, v_new_id, v_item_row.category, v_item_row.approved_quantity,
             case when v_result = 'PASSED' then v_item_row.approved_quantity else v_item_row.approved_quantity - v_affected end,
             case when v_result = 'REWORK_REQUIRED' then v_affected else 0 end,
             case when v_result = 'BLOCKED' then v_affected else 0 end,
             case when v_result = 'DAMAGED' then v_affected else 0 end,
             v_result, coalesce(p_payload->'checklist', '{}'::jsonb), nullif(btrim(p_payload->>'defectType'), ''),
             nullif(btrim(p_payload->>'defectDescription'), ''), v_actor.user_id, nullif(btrim(p_payload->>'notes'), ''));

          if v_result <> 'PASSED' then
            v_remaining := v_affected;
            for v_res in
              select * from public.agra_inventory_reservations
              where order_item_id = v_item_row.id and status = 'ACTIVE' and reserved_quantity > 0
              order by reserved_at for update
            loop
              exit when v_remaining <= 0;
              select * into v_batch from public.agra_inventory_batches where id = v_res.inventory_batch_id for update;
              v_move := least(v_remaining, v_res.reserved_quantity);
              update public.agra_inventory_batches
              set physical_quantity = physical_quantity,
                  released_quantity = released_quantity - v_move,
                  reserved_quantity = reserved_quantity - v_move,
                  rework_quantity = rework_quantity + case when v_result = 'REWORK_REQUIRED' then v_move else 0 end,
                  blocked_quantity = blocked_quantity + case when v_result = 'BLOCKED' then v_move else 0 end,
                  damaged_quantity = damaged_quantity + case when v_result = 'DAMAGED' then v_move else 0 end,
                  qc_status = case when released_quantity - v_move = 0 then
                    case when v_result = 'REWORK_REQUIRED' then 'REWORK_REQUIRED' when v_result = 'BLOCKED' then 'BLOCKED' else 'DAMAGED' end
                    else qc_status end,
                  updated_at = now()
              where id = v_batch.id;
              update public.agra_inventory_reservations
              set reserved_quantity = reserved_quantity - v_move,
                  status = case when reserved_quantity - v_move = 0 then 'RELEASED' else status end,
                  released_at = case when reserved_quantity - v_move = 0 then now() else released_at end
              where id = v_res.id;
              v_quantity_changes := v_quantity_changes || jsonb_build_array(jsonb_build_object('batchId', v_batch.id, 'movedFromReleased', v_move, 'result', v_result));
              v_remaining := v_remaining - v_move;
            end loop;
            if v_remaining > 0 then
              raise exception using errcode = 'P1006', message = 'Quality quantity exceeds the active reserved quantity.';
            end if;
            if v_result = 'REWORK_REQUIRED' then
              insert into public.agra_rework_records
                (organization_id, order_id, order_item_id, inventory_batch_id, defect_type, defect_description,
                 affected_quantity, rework_quantity, rejected_quantity, responsible_role, responsible_user_id, due_date)
              values
                (v_actor.organization_id, v_order.id, v_item_row.id, v_new_id,
                 coalesce(nullif(btrim(p_payload->>'defectType'), ''), 'QUALITY_DEFECT'),
                 coalesce(nullif(btrim(p_payload->>'defectDescription'), ''), 'Rework required after quality inspection.'),
                 v_affected, v_affected, 0, 'INVENTORY_QUALITY', v_actor.user_id,
                 coalesce(nullif(p_payload->>'reworkDueDate', '')::date, current_date + 2));
            end if;
          end if;
        end loop;
        if v_result = 'PASSED' then
          v_new_status := 'PACKING';
        elsif v_result = 'REWORK_REQUIRED' then
          v_new_status := 'REWORK_REQUIRED';
        else
          v_new_status := 'BLOCKED';
          insert into public.agra_exceptions (organization_id, order_id, code, message, severity, affected_quantity)
          values (v_actor.organization_id, v_order.id, 'QUALITY_' || v_result, coalesce(nullif(btrim(p_payload->>'defectDescription'), ''), 'Quality check blocked this order.'), 'HIGH', v_affected);
        end if;
        update public.agra_orders set fulfillment_status = v_new_status, updated_at = now() where id = v_order.id;
        v_response := jsonb_build_object('ok', true, 'code', 'QC_RECORDED', 'message', 'Quality result recorded.', 'entityId', v_order.id, 'newStatus', v_new_status, 'quantityChanges', v_quantity_changes);

      elsif v_action = 'COMPLETE_REWORK' then
        if v_actor.role <> all(array['INVENTORY_QUALITY', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Quality or manager access is required.';
        end if;
        v_new_id := (p_payload->>'reworkId')::uuid;
        select * into v_rework from public.agra_rework_records
        where id = v_new_id and order_id = v_order.id and organization_id = v_actor.organization_id
        for update;
        if not found or v_rework.status = 'COMPLETED' then
          raise exception using errcode = 'P1002', message = 'This rework task is not open.';
        end if;
        select * into v_batch from public.agra_inventory_batches where id = v_rework.inventory_batch_id for update;
        v_result := upper(p_payload->>'result');
        if v_result = 'RELEASED' then
          update public.agra_inventory_batches
          set rework_quantity = rework_quantity - v_rework.rework_quantity,
              released_quantity = released_quantity + v_rework.rework_quantity,
              qc_status = 'RELEASED', qc_release_date = current_date, updated_at = now()
          where id = v_batch.id;
          v_new_status := 'AWAITING_STOCK_CHECK';
        elsif v_result = 'BLOCKED' then
          update public.agra_inventory_batches
          set rework_quantity = rework_quantity - v_rework.rework_quantity,
              blocked_quantity = blocked_quantity + v_rework.rework_quantity,
              qc_status = 'BLOCKED', updated_at = now()
          where id = v_batch.id;
          v_new_status := 'BLOCKED';
        elsif v_result = 'DAMAGED' then
          update public.agra_inventory_batches
          set rework_quantity = rework_quantity - v_rework.rework_quantity,
              damaged_quantity = damaged_quantity + v_rework.rework_quantity,
              qc_status = 'DAMAGED', updated_at = now()
          where id = v_batch.id;
          v_new_status := 'BLOCKED';
        else
          raise exception using errcode = '22023', message = 'Choose released, blocked, or damaged.';
        end if;
        update public.agra_rework_records
        set status = 'COMPLETED', completion_date = current_date,
            completion_note = nullif(btrim(p_payload->>'completionNote'), ''),
            reinspection_result = v_result, updated_at = now()
        where id = v_rework.id;
        update public.agra_orders set fulfillment_status = v_new_status, updated_at = now() where id = v_order.id;
        v_quantity_changes := jsonb_build_array(jsonb_build_object('batchId', v_batch.id, 'reworkCompleted', v_rework.rework_quantity, 'result', v_result));
        v_response := jsonb_build_object('ok', true, 'code', 'REWORK_COMPLETED', 'message', 'Rework and reinspection recorded.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'COMPLETE_PACKING' then
        if v_actor.role <> all(array['PACKING_DISPATCH', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Packing or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'PACKING' then
          raise exception using errcode = 'P1002', message = 'This order is not ready for packing.';
        end if;
        v_new_id := gen_random_uuid();
        insert into public.agra_packing_records
          (id, organization_id, order_id, package_count, carton_count, bundle_count, quantity_per_package,
           packaging_type, total_shipment_weight_kg, fragile, moisture_protection, custom_packaging_instructions,
           packer_id, packing_started_at, packing_completed_at, packing_notes)
        values
          (v_new_id, v_actor.organization_id, v_order.id, coalesce(nullif(p_payload->>'packageCount', '')::integer, 0),
           coalesce(nullif(p_payload->>'cartonCount', '')::integer, 0), coalesce(nullif(p_payload->>'bundleCount', '')::integer, 0),
           nullif(p_payload->>'quantityPerPackage', '')::numeric, coalesce(nullif(btrim(p_payload->>'packagingType'), ''), 'Protective paper packaging'),
           nullif(p_payload->>'totalShipmentWeightKg', '')::numeric, coalesce((p_payload->>'fragile')::boolean, false),
           coalesce((p_payload->>'moistureProtection')::boolean, false), nullif(btrim(p_payload->>'customPackagingInstructions'), ''),
           v_actor.user_id, coalesce(nullif(p_payload->>'startedAt', '')::timestamptz, now()), now(), nullif(btrim(p_payload->>'notes'), ''));
        for v_item_row in select * from public.agra_order_items where order_id = v_order.id loop
          select coalesce((x->>'packedQuantity')::numeric, v_item_row.approved_quantity) into v_packed
          from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) x
          where x->>'orderItemId' = v_item_row.id::text
          limit 1;
          v_packed := coalesce(v_packed, v_item_row.approved_quantity);
          if v_packed <> v_item_row.approved_quantity then
            raise exception using errcode = 'P1004', message = 'Packed quantities must match approved quantities.';
          end if;
          insert into public.agra_packing_items
            (organization_id, packing_record_id, order_item_id, packed_quantity, unit)
          values
            (v_actor.organization_id, v_new_id, v_item_row.id, v_packed, v_item_row.unit);
        end loop;
        update public.agra_orders set fulfillment_status = 'READY_FOR_HANDOVER', updated_at = now() where id = v_order.id;
        v_new_status := 'READY_FOR_HANDOVER';
        v_response := jsonb_build_object('ok', true, 'code', 'PACKING_COMPLETED', 'message', 'Packing completed. Documents and handover are next.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'VERIFY_DOCUMENTS' then
        if v_actor.role <> all(array['PACKING_DISPATCH', 'OPERATIONS_SUPERVISOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Packing, supervisor, or manager access is required.';
        end if;
        for v_doc in select value from jsonb_array_elements(coalesce(p_payload->'documents', '[]'::jsonb)) loop
          update public.agra_documents
          set reference_number = nullif(btrim(v_doc->>'referenceNumber'), ''),
              status = case when nullif(btrim(v_doc->>'referenceNumber'), '') is null then 'MISSING' else 'VERIFIED' end,
              verified_by = case when nullif(btrim(v_doc->>'referenceNumber'), '') is null then null else v_actor.user_id end,
              verified_at = case when nullif(btrim(v_doc->>'referenceNumber'), '') is null then null else now() end,
              notes = nullif(btrim(v_doc->>'notes'), '')
          where order_id = v_order.id and document_type = v_doc->>'documentType';
        end loop;
        v_new_status := v_order.fulfillment_status;
        v_response := jsonb_build_object('ok', true, 'code', 'DOCUMENTS_UPDATED', 'message', 'Document checks updated.', 'entityId', v_order.id, 'newStatus', v_new_status);

      elsif v_action = 'CONFIRM_HANDOVER' then
        if v_actor.role <> all(array['PACKING_DISPATCH', 'OPERATIONS_SUPERVISOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Packing, supervisor, or manager access is required.';
        end if;
        if v_order.fulfillment_status <> 'READY_FOR_HANDOVER' then
          raise exception using errcode = 'P1002', message = 'This order is not ready for handover.';
        end if;
        if exists (select 1 from public.agra_documents where order_id = v_order.id and required and status <> 'VERIFIED') then
          raise exception using errcode = 'P1003', message = 'Verify every required document before handover.';
        end if;
        v_result := upper(p_payload->>'deliveryMethod');
        if v_result in ('THIRD_PARTY_COURIER', 'HIRED_TRANSPORTER', 'EXPORT_FREIGHT')
           and (nullif(btrim(p_payload->>'companyName'), '') is null or nullif(btrim(p_payload->>'trackingNumber'), '') is null) then
          raise exception using errcode = 'P1007', message = 'Courier company and tracking number are required.';
        end if;
        insert into public.agra_handovers
          (organization_id, order_id, delivery_method, company_name, contact, tracking_number, consignment_number,
           package_count, shipment_weight_kg, handover_person, receiver_name, customer_representative, receiver_phone,
           vehicle_number, driver_name, driver_phone, destination, acknowledgement_reference, handover_at, notes, confirmed_by)
        values
          (v_actor.organization_id, v_order.id, v_result, nullif(btrim(p_payload->>'companyName'), ''),
           nullif(btrim(p_payload->>'contact'), ''), nullif(btrim(p_payload->>'trackingNumber'), ''),
           nullif(btrim(p_payload->>'consignmentNumber'), ''), (p_payload->>'packageCount')::integer,
           nullif(p_payload->>'shipmentWeightKg', '')::numeric, nullif(btrim(p_payload->>'handoverPerson'), ''),
           nullif(btrim(p_payload->>'receiverName'), ''), nullif(btrim(p_payload->>'customerRepresentative'), ''),
           nullif(btrim(p_payload->>'receiverPhone'), ''), nullif(btrim(p_payload->>'vehicleNumber'), ''),
           nullif(btrim(p_payload->>'driverName'), ''), nullif(btrim(p_payload->>'driverPhone'), ''),
           nullif(btrim(p_payload->>'destination'), ''), nullif(btrim(p_payload->>'acknowledgementReference'), ''),
           coalesce(nullif(p_payload->>'handoverAt', '')::timestamptz, now()), nullif(btrim(p_payload->>'notes'), ''), v_actor.user_id);
        for v_res in
          select * from public.agra_inventory_reservations
          where order_id = v_order.id and status = 'ACTIVE' and reserved_quantity > 0
          order by reserved_at for update
        loop
          select * into v_batch from public.agra_inventory_batches where id = v_res.inventory_batch_id for update;
          if v_batch.reserved_quantity < v_res.reserved_quantity or v_batch.released_quantity < v_res.reserved_quantity then
            raise exception using errcode = 'P1006', message = 'Inventory changed before handover. No stock was deducted.';
          end if;
          update public.agra_inventory_batches
          set physical_quantity = physical_quantity - v_res.reserved_quantity,
              released_quantity = released_quantity - v_res.reserved_quantity,
              reserved_quantity = reserved_quantity - v_res.reserved_quantity,
              updated_at = now()
          where id = v_batch.id;
          update public.agra_inventory_reservations set status = 'DEDUCTED', deducted_at = now() where id = v_res.id;
          v_quantity_changes := v_quantity_changes || jsonb_build_array(jsonb_build_object('batchId', v_batch.id, 'deducted', v_res.reserved_quantity, 'unit', v_res.unit));
        end loop;
        update public.agra_orders
        set order_status = 'CLOSED', fulfillment_status = 'DISPATCHED', dispatched_at = now(), updated_at = now()
        where id = v_order.id;
        v_new_status := 'DISPATCHED';
        v_response := jsonb_build_object('ok', true, 'code', 'HANDOVER_CONFIRMED', 'message', 'Handover confirmed and inventory deducted.', 'entityId', v_order.id, 'newStatus', v_new_status, 'quantityChanges', v_quantity_changes);

      elsif v_action = 'CANCEL_ORDER' then
        if v_actor.role <> all(array['OPERATIONS_SUPERVISOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Supervisor or manager access is required.';
        end if;
        if v_order.fulfillment_status in ('DISPATCHED', 'HANDED_OVER', 'CANCELLED') then
          raise exception using errcode = 'P1002', message = 'A dispatched, handed-over, or cancelled order cannot be cancelled.';
        end if;
        if nullif(btrim(p_payload->>'reason'), '') is null then
          raise exception using errcode = '22023', message = 'Cancellation reason is required.';
        end if;
        for v_res in
          select * from public.agra_inventory_reservations
          where order_id = v_order.id and status = 'ACTIVE' and reserved_quantity > 0
          order by reserved_at for update
        loop
          select * into v_batch from public.agra_inventory_batches where id = v_res.inventory_batch_id for update;
          if v_batch.reserved_quantity < v_res.reserved_quantity then
            raise exception using errcode = 'P1006', message = 'Reservation ledger is inconsistent. Cancellation was not applied.';
          end if;
          update public.agra_inventory_batches set reserved_quantity = reserved_quantity - v_res.reserved_quantity, updated_at = now() where id = v_batch.id;
          update public.agra_inventory_reservations set status = 'RELEASED', released_at = now() where id = v_res.id;
          v_quantity_changes := v_quantity_changes || jsonb_build_array(jsonb_build_object('batchId', v_batch.id, 'released', v_res.reserved_quantity, 'unit', v_res.unit));
        end loop;
        update public.agra_orders
        set order_status = 'CANCELLED', fulfillment_status = 'CANCELLED', cancellation_reason = btrim(p_payload->>'reason'),
            cancelled_by = v_actor.user_id, cancelled_at = now(), updated_at = now()
        where id = v_order.id;
        v_new_status := 'CANCELLED';
        v_response := jsonb_build_object('ok', true, 'code', 'ORDER_CANCELLED', 'message', 'Order cancelled and reservations released.', 'entityId', v_order.id, 'newStatus', v_new_status, 'quantityChanges', v_quantity_changes);

      elsif v_action = 'RESOLVE_EXCEPTION' then
        if v_actor.role <> all(array['OPERATIONS_SUPERVISOR', 'MANAGER_ADMIN']) then
          raise exception using errcode = '42501', message = 'Supervisor or manager access is required.';
        end if;
        update public.agra_exceptions
        set status = 'RESOLVED', resolved_at = now(), resolved_by = v_actor.user_id,
            resolution_note = nullif(btrim(p_payload->>'resolutionNote'), '')
        where id = (p_payload->>'exceptionId')::uuid and order_id = v_order.id and status = 'OPEN';
        if not found then
          raise exception using errcode = '22023', message = 'Open exception was not found.';
        end if;
        if v_order.fulfillment_status = 'BLOCKED'
           and not exists (select 1 from public.agra_exceptions where order_id = v_order.id and status = 'OPEN') then
          update public.agra_orders set fulfillment_status = 'AWAITING_STOCK_CHECK', updated_at = now() where id = v_order.id;
          v_new_status := 'AWAITING_STOCK_CHECK';
        else
          v_new_status := v_order.fulfillment_status;
        end if;
        v_response := jsonb_build_object('ok', true, 'code', 'EXCEPTION_RESOLVED', 'message', 'Problem marked resolved.', 'entityId', v_order.id, 'newStatus', v_new_status);

      else
        raise exception using errcode = '22023', message = 'Unknown action.';
      end if;
    end if;

    insert into public.agra_audit_events
      (organization_id, request_id, actor_id, actor_name, actor_role, action, entity_type, entity_id,
       previous_status, new_status, success, reason, quantity_changes, source)
    values
      (v_actor.organization_id, p_request_id, v_actor.user_id, v_actor.full_name, v_actor.role, v_action,
       v_entity_type, v_entity_id, v_previous_status, v_new_status, true, v_response->>'message',
       nullif(v_quantity_changes, '[]'::jsonb), coalesce(nullif(p_payload->>'source', ''), 'N8N'));

    update public.agra_action_requests
    set entity_type = v_entity_type, entity_id = v_entity_id, status = 'SUCCEEDED', response = v_response, completed_at = now()
    where request_id = p_request_id;
    return v_response;

  exception when others then
    v_error_code := sqlstate;
    v_error_message := sqlerrm;

    if p_order_id is not null and v_error_code = 'P1001' then
      update public.agra_orders
      set fulfillment_status = 'BLOCKED', updated_at = now()
      where id = p_order_id and organization_id = v_actor.organization_id and fulfillment_status not in ('DISPATCHED', 'CANCELLED');
      insert into public.agra_exceptions (organization_id, order_id, code, message, severity, status)
      values (v_actor.organization_id, p_order_id, 'INSUFFICIENT_RELEASED_STOCK', v_error_message, 'HIGH', 'OPEN');
    elsif p_order_id is not null and v_error_code = 'P1003' then
      insert into public.agra_exceptions (organization_id, order_id, code, message, severity, status)
      values (v_actor.organization_id, p_order_id, 'MISSING_REQUIRED_DOCUMENT', v_error_message, 'HIGH', 'OPEN');
    elsif p_order_id is not null and v_error_code in ('P1004', 'P1005', 'P1006', 'P1007') then
      insert into public.agra_exceptions (organization_id, order_id, code, message, severity, status)
      values (v_actor.organization_id, p_order_id, 'OPERATION_CONTROL_FAILED', v_error_message, 'HIGH', 'OPEN');
    end if;

    v_response := jsonb_build_object(
      'ok', false,
      'code', case
        when v_error_code = 'P1001' then 'INSUFFICIENT_RELEASED_STOCK'
        when v_error_code = 'P1002' then 'INVALID_STATUS'
        when v_error_code = 'P1003' then 'MISSING_REQUIRED_DOCUMENT'
        when v_error_code = 'P1004' then 'PACKING_MISMATCH'
        when v_error_code = 'P1005' then 'PICKING_MISMATCH'
        when v_error_code = 'P1006' then 'INVENTORY_CONFLICT'
        when v_error_code = 'P1007' then 'HANDOVER_DETAILS_REQUIRED'
        when v_error_code = '23505' then 'DUPLICATE_RECORD'
        when v_error_code = '42501' then 'FORBIDDEN'
        else 'ACTION_FAILED'
      end,
      'message', v_error_message,
      'errorCode', v_error_code,
      'entityId', coalesce(v_entity_id, p_order_id)
    );

    insert into public.agra_audit_events
      (organization_id, request_id, actor_id, actor_name, actor_role, action, entity_type, entity_id,
       previous_status, new_status, success, reason, source, error_code)
    values
      (v_actor.organization_id, p_request_id, v_actor.user_id, v_actor.full_name, v_actor.role, v_action,
       v_entity_type, coalesce(v_entity_id, p_order_id), v_previous_status, null, false, v_error_message,
       coalesce(nullif(p_payload->>'source', ''), 'N8N'), v_error_code);

    update public.agra_action_requests
    set entity_type = v_entity_type, entity_id = coalesce(v_entity_id, p_order_id), status = 'FAILED', response = v_response, completed_at = now()
    where request_id = p_request_id;
    return v_response;
  end;
end
$$;

revoke all on function public.agra_execute_action(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.agra_execute_action(uuid, text, uuid, jsonb) to authenticated, service_role;
