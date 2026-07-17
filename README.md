# Agra Operations Reference Pilot

Agra Paper Products Order, Inventory, Quality, Packing, Dispatch, and Management Dashboard for Agra Industries Pvt. Ltd., Nepal.

This is a working reference pilot based on preliminary company information. Products, roles, controls, approval rules, and reporting fields require operational validation before production use.

## Live Architecture

- Next.js 16, React 19, TypeScript, Tailwind CSS, and Lucide icons
- Supabase Auth with five real demo users
- Supabase PostgreSQL as the transactional system of record
- Row Level Security and organization-scoped read access
- Authoritative database functions for actions, locking, idempotency, and audit
- n8n Cloud as the authenticated action gateway and scheduled monitor layer
- ChatGPT Sites deployment with a public, shareable URL

No browser fallback or fictional local state is used. If Supabase or n8n is unavailable, the application reports the failure and does not present an unconfirmed change.

## Roles

| Role | Demo email | Main work |
| --- | --- | --- |
| Sales & Orders | `sales@agra-demo.example` | Customers, drafts, order submission |
| Stock & Quality | `quality@agra-demo.example` | Stock checks, batch QC, order QC, rework |
| Packing & Dispatch | `packing@agra-demo.example` | Picking, packing, documents, handover |
| Operations Supervisor | `supervisor@agra-demo.example` | Approval, cancellation, exceptions, reports |
| Manager | `manager@agra-demo.example` | Full visibility, team access, system health, reset |

The public pilot opens a real role-scoped demo session when a role button is selected. A restricted Supabase Edge Function brokers a short-lived passwordless session; no demo password is stored in the app or sent to the browser.

## Run Locally

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local`. `AGRA_DEMO_PASSWORD` is required only by the live verification script. The Supabase publishable key is public by design; never place the demo password, a Supabase secret, or a service-role key in a `NEXT_PUBLIC_*` variable.

## Verification

```bash
pnpm test:unit
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Run the live integration and failure-scenario suite with the demo password supplied only to the process:

```powershell
$env:AGRA_DEMO_PASSWORD='<demo password>'
pnpm verify:demo
```

The live verifier tests authentication, permissions, RLS, reset, insufficient stock, rework, missing documents, duplicate orders, idempotency, cancellation, concurrent reservations, failed QC, the full 200-diary dispatch, refresh persistence, n8n health, and outage behavior. It restores the reference dataset in a `finally` block.

## Project Map

- `src/components/agra-operations-app.tsx` - role-specific operational interface
- `src/lib/agra-backend.ts` - Supabase and n8n client boundary
- `src/lib/agra-rules.ts` - display and workflow rule helpers
- `supabase/migrations/` - additive schema, seed, actions, read model, and hardening
- `n8n/exports/` - sanitized importable workflows
- `n8n/workflows/` - workflow sources
- `scripts/verify-demo.mjs` - production integration suite
- `docs/business-rules.md` - pilot business controls
- `docs/testing-and-demo.md` - test evidence and presentation flow
- `docs/operations-runbook.md` - health, reset, deployment, and rollback
- `backups/pre-agra-pilot-20260717/` - prebuild database, n8n, data, and hosting record

## Scope Boundary

Phase 1 covers paper-product commercial operations only. Accounting, tax, payroll, raw-material procurement, full production planning, broom operations, community-program monitoring, and impact traceability remain future modules.
