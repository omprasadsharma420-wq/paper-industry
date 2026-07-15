# Controlled Finished Goods Dispatch Rules

This pilot starts after a customer order or dispatch request exists. It does not cover procurement, production, accounting, GPS, RFID, tax calculation, or delivery confirmation after factory exit.

## Workflow

`DRAFT -> AWAITING_APPROVAL -> APPROVED -> VEHICLE_ASSIGNED -> VEHICLE_ARRIVED -> LOADING -> AWAITING_WEIGHT_CHECK -> AWAITING_DOCUMENT_CHECK -> AWAITING_GATE_CLEARANCE -> CLEARED_FOR_EXIT -> DISPATCHED`

Terminal exception statuses:

- `REJECTED`
- `CANCELLED`

## Role Control

- `DISPATCH_CLERK`: create request, submit request, assign vehicle.
- `WAREHOUSE_QUALITY`: loading, weight verification, inventory and quality visibility.
- `DISPATCH_SUPERVISOR`: approval, rejection, document verification.
- `GATE_SECURITY`: vehicle arrival, gate clearance, vehicle exit confirmation.
- `MANAGER_ADMIN`: full visibility and auditable exception resolution.

## Business Rules

- Paper reels use `KG`; sheet paper reams use `REAM`.
- No automatic conversion between `KG` and `REAM`.
- Only `RELEASED` inventory can be reserved or dispatched.
- Reservation happens after supervisor approval.
- Inventory deduction happens only after vehicle exit confirmation.
- Partial dispatch is not allowed in this pilot.
- Weight tolerance is `+/- 1.5%` for KG dispatches.
- Required documents are commercial invoice, delivery challan, packing list, and gate pass.
- Missing documents block gate clearance.
- Manager/admin exception resolution does not hide the exception; it marks it resolved and adds audit history.

## Demo Scenarios

- Successful dispatch.
- Insufficient released inventory.
- Quality blocked inventory.
- Weight variance exceeding tolerance.
- Missing documentation.
