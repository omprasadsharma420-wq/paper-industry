# Paper Industry Dispatch Control Pilot

Controlled Finished Goods Dispatch Tracking and Reporting for a medium-sized paper manufacturing company in Nepal/India.

The pilot demonstrates approval controls, released-stock checks, quality blocks, inventory reservation, vehicle movement, loading, weight verification, document verification, gate clearance, dispatch confirmation, and audit history.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase-ready schema and client configuration
- n8n-ready workflow import

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

The migration is in:

```text
supabase/migrations/202607150001_dispatch_control_schema.sql
```

The app includes a Supabase client at:

```text
src/lib/supabase.ts
```

Copy `.env.example` to `.env.local` when connecting the UI to live Supabase data.

## n8n

Import this workflow into n8n Cloud:

```text
n8n/dispatch-control-workflow.json
```

It provides a first `POST /dispatch-control` webhook for validation, weight-check, and document-check business rules.

## Business Rules

See:

```text
docs/business-rules.md
```
