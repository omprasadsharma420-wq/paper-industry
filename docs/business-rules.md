# Agra Paper Products Pilot Rules

## Scope

The pilot starts with customers and commercial paper-product orders. It covers finished-goods inventory, batch control, reservation, picking, quality, rework, packing, required documents, delivery handover, exceptions, audit, reporting, and reset.

It does not cover accounting, payment approval, tax, raw-material procurement, full production planning, payroll, broom operations, community-program records, or impact claims.

## Order Flow

Made to stock:

`Draft -> Stock check -> Approval and reservation -> Picking -> Quality -> Packing -> Documents -> Handover -> Dispatched`

Production required:

`Draft -> Stock check -> Awaiting production -> Production update -> Approval -> Picking -> Quality -> Packing -> Handover`

Commercial order status is separate from fulfilment status. Payment remains `NOT_TRACKED` and approval never implies payment confirmation.

## Roles

- Sales & Orders manages customers, drafts, and submission.
- Stock & Quality checks released stock, receives batches, records QC, and completes rework.
- Packing & Dispatch picks, packs, verifies documents, and confirms handover.
- Operations Supervisor approves reservations, cancels eligible orders, resolves exceptions, and reviews reports.
- Manager has full pilot visibility, role administration, health checks, and protected reset.

Roles come from `agra_profiles`, not browser input. Every mutation rechecks the authenticated user and role in PostgreSQL.

## Inventory

- `physical_quantity` is the quantity physically held in the batch.
- `released_quantity` is the QC-released quantity.
- `reserved_quantity` belongs to active approved orders.
- `available_quantity = released_quantity - reserved_quantity`.
- Rework, blocked, damaged, and pending quantities are never dispatchable.
- Reservation locks inventory rows and allocates released batches by oldest production date, then batch number.
- Final handover deducts physical and released inventory and marks reservations deducted.
- Negative quantities and reservation-ledger mismatches fail health checks.

## Quality and Rework

Quality checklists vary by product category. A passed order proceeds to packing. Rework, blocked, or damaged quantities are moved out of released and reserved stock in the same transaction. Rework creates an assigned task and requires reinspection before release.

## Packing and Handover

- Packed quantities must equal approved quantities.
- Invoice, packing list, and dispatch note must all exist and be verified.
- The database handover trigger independently enforces the document requirement.
- Courier, transporter, and export methods require a company and tracking reference.
- Customer pickup records receiver and acknowledgement details.
- Inventory is deducted only when handover succeeds.

## Idempotency and Concurrency

Every action uses a unique request UUID. A repeated successful UUID returns the stored response without repeating inventory or workflow changes. Order and inventory rows are locked during critical transitions, so competing reservations cannot oversell released stock.

## Cancellation and Duplicates

- Cancellation requires a supervisor or manager, an eligible status, and a reason.
- Active reservations are released in the same transaction.
- A dispatched order cannot be cancelled by the pilot workflow.
- Customer order references are unique per customer and organization when provided.

## Audit and Failures

Successful and failed actions append an audit row with actor, role, request, status change, reason, quantity change, source, and error code. Audit rows cannot be edited or deleted by application users. Passwords, keys, tokens, and authorization headers are never written to audit records.
