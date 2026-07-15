# Paper Industry Dispatch Control Pilot

Controlled Finished Goods Dispatch Tracking and Reporting for a medium-sized paper manufacturing company in Nepal/India.

The pilot demonstrates approval controls, released-stock checks, quality blocks, inventory reservation, vehicle movement, loading, weight verification, document verification, gate clearance, dispatch confirmation, and audit history.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase-backed shared operational state
- n8n production control workflow

## Demo Login Roles

Use the login screen to enter as:

- `DISPATCH_CLERK`
- `WAREHOUSE_QUALITY`
- `DISPATCH_SUPERVISOR`
- `GATE_SECURITY`
- `MANAGER_ADMIN`

Actions are role based. Users only see workflow actions available to their role.

## Run Locally

This workspace uses Codex's bundled Node and pnpm runtime. In a normal machine with Node installed:

```bash
pnpm install
pnpm dev
```

In this Codex desktop workspace, commands need the bundled runtime on PATH:

```powershell
$env:PATH='C:\Users\ompra\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\ompra\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
pnpm dev
```

## Supabase

The versioned migrations are in:

```text
supabase/migrations/
```

The app includes a Supabase client at:

```text
src/lib/supabase.ts
```

Copy `.env.example` to `.env.local` when running against the live demo backend.

## n8n

Import this workflow into n8n Cloud:

```text
n8n/dispatch-control-workflow.json
```

Production webhook base URL:

```text
https://om420.app.n8n.cloud/webhook
```

The workflow provides:

```text
GET /paper-dispatch-health
POST /paper-dispatch-control
```

The dispatch-control endpoint handles validation, approval/reservation, vehicle movement, weight checks, document checks, gate clearance, and exit confirmation.

## Verification

With the three public environment variables configured, run:

```bash
pnpm verify:demo
```

The verifier runs a prepared dispatch through every role using the production n8n webhook and Supabase RPCs, checks shared truck, weight, paper, and inventory data, creates a new job, and resets the presentation dataset when it finishes.

## Business Rules

See:

```text
docs/business-rules.md
```
