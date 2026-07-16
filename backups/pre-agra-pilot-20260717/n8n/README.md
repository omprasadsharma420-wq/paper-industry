# Paper Industry n8n Workflow

This folder contains the importable n8n workflow for the dispatch control API.

## Files

- `dispatch-control-workflow.json` is the file to import into n8n.
- `generate-dispatch-control-workflow.mjs` is the source generator for the workflow JSON.
- `sample-payloads/` contains request examples for quick testing.

## Import

1. Open n8n.
2. Go to **Workflows**.
3. Choose **Import from file**.
4. Select `n8n/dispatch-control-workflow.json`.
5. Save the workflow.
6. Activate it.

## Endpoints

After activation, use:

- `GET https://om420.app.n8n.cloud/webhook/paper-dispatch-health`
- `POST https://om420.app.n8n.cloud/webhook/paper-dispatch-control`

While testing inside the n8n editor, use:

- `GET https://om420.app.n8n.cloud/webhook-test/paper-dispatch-health`
- `POST https://om420.app.n8n.cloud/webhook-test/paper-dispatch-control`

## Why This Version Is More Reliable

The workflow accepts both n8n webhook-wrapped requests and direct JSON payloads. In n8n, webhook requests commonly arrive under `body`, while local/manual executions may pass the payload directly. The Code node normalizes both shapes before applying business rules.

## Supported Actions

- `HEALTH_CHECK`
- `VALIDATE_DISPATCH`
- `CHECK_INVENTORY`
- `SUBMIT_FOR_APPROVAL`
- `APPROVE_AND_RESERVE`
- `ASSIGN_VEHICLE`
- `MARK_VEHICLE_ARRIVED`
- `START_LOADING`
- `COMPLETE_LOADING`
- `VERIFY_WEIGHT`
- `VERIFY_DOCUMENTS`
- `CLEAR_GATE`
- `CONFIRM_EXIT`
- `RESOLVE_EXCEPTION`
- `REJECT`
- `CANCEL`

## Response Shape

Every response includes:

- `ok`
- `httpStatus`
- `policyVersion`
- `traceId`
- `action`
- `currentStatus`
- `recommendedNextStatus`
- `nextRequiredRole`
- `controlStatus`
- `exceptions`
- `warnings`
- `reservations`
- `inventoryMutations`
- `report`
- `auditEvent`
- `uiMessage`

## Key Business Rules

- Only `RELEASED` inventory can be reserved.
- Stock is reserved FIFO by production date and batch number.
- Blocked and pending-inspection stock is reported but never allocated.
- Units must match exactly; automatic `KG` and `REAM` conversion is blocked.
- Weight tolerance defaults to `1.5%`.
- Gate clearance requires vehicle details, acceptable weight, verified documents, and no unresolved exceptions.
- Required dispatch documents are `COMMERCIAL_INVOICE`, `DELIVERY_CHALLAN`, `PACKING_LIST`, and `GATE_PASS`.

## Quick Tests

Use these sample files as request bodies:

- `sample-payloads/health-check.json`
- `sample-payloads/approve-and-reserve.json`
- `sample-payloads/verify-weight-block.json`
- `sample-payloads/verify-documents-block.json`
