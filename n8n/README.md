# Agra Operations n8n Workflows

n8n authenticates callers, orchestrates requests, invokes Supabase business functions, records scheduled results, and returns structured responses. Supabase remains the transactional authority.

## Live Workflows

| Workflow | Live ID | Purpose |
| --- | --- | --- |
| Agra Operations - Action Gateway | `UZvuu1IPh20GjfHD` | Authenticated action webhook |
| Agra Operations - Health | `pRFpYvBkQEHME4px` | Public dependency health response |
| Agra Operations - Low Stock | `QSvETTu9RecpoSAm` | Scheduled low-stock monitor |
| Agra Operations - Rework Reminder | `iVzJLOQvg58Gf8DY` | Scheduled open-rework reminder |
| Agra Operations - Exception Escalation | `GY44jKq757IcnplM` | Scheduled exception summary |
| Agra Operations - Daily Report | `PEhfp25RNxnMqCi6` | Scheduled daily operations summary |

Production endpoints:

- `POST https://om420.app.n8n.cloud/webhook/agra-operations-action`
- `GET https://om420.app.n8n.cloud/webhook/agra-operations-health`

## Repository Files

- `exports/*.json` - sanitized workflow files for n8n import
- `workflows/*.mjs` - readable workflow definitions
- `generate-agra-monitor-workflows.mjs` - generator for scheduled workflows
- `sample-payloads/action-request.json` - action request shape
- `sample-payloads/health-check.json` - health endpoint reference

## Import and Configure

1. Import each JSON file from `exports/` into n8n Cloud.
2. Keep the action and health webhook paths unchanged unless the frontend environment is updated too.
3. Replace `__AGRA_MANAGER_PASSWORD__` in scheduled workflow HTTP nodes with a protected n8n credential or secret expression.
4. Save and publish each workflow.
5. Run every scheduled workflow manually once and confirm a successful `agra_system_events` row in Supabase.

The Supabase publishable key in these exports is intentionally non-secret. Never place a Supabase service-role key, database password, n8n access token, or user access token in an exported workflow.

## Action Contract

Request:

```json
{
  "requestId": "unique-uuid",
  "action": "CHECK_STOCK",
  "orderId": "order-uuid-or-null",
  "payload": {}
}
```

Headers:

```text
Authorization: Bearer <Supabase user access token>
Content-Type: application/json
```

Response:

```json
{
  "ok": true,
  "code": "STOCK_CHECK_PASSED",
  "message": "Stock check passed.",
  "entityId": "order-uuid",
  "newStatus": "AWAITING_APPROVAL"
}
```

Business errors return `ok: false` with a stable code. Reusing a successful `requestId` returns the saved response with `idempotentReplay: true` and does not repeat the change.
