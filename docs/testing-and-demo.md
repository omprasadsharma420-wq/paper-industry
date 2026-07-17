# Testing and Demo Guide

## Automated Checks

Run local checks:

```bash
pnpm test:unit
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Run the live suite with `AGRA_DEMO_PASSWORD` set only in the current process:

```bash
pnpm verify:demo
```

The live suite verifies:

1. Five real authenticated role profiles
2. Anonymous workspace denial
3. Server-side role denial
4. Direct role-write denial through RLS and grants
5. Reference reset integrity
6. Insufficient released stock
7. Seeded rework isolation
8. Missing-document handover block
9. Duplicate customer order protection
10. Idempotent double approval
11. Cancellation and reservation release
12. Competing 200 and 100 unit reservations
13. Failed QC movement to rework
14. Full cross-role 200-diary dispatch
15. Fresh-session persistence and health reconciliation
16. n8n health and simulated outage behavior

The finalizer always restores the reference dataset.

## Presentation Scenario

Use `AGRA-DEMO-001` for the successful guided flow:

1. Sales submits 200 A5 KhoriyaCo handmade diaries.
2. Inventory & Quality confirms released stock.
3. Supervisor approves and reserves 200.
4. Packing picks 200.
5. Quality passes the diary checklist.
6. Packing records 10 cartons of 20.
7. Packing verifies invoice, packing list, and dispatch note.
8. Packing confirms handover.
9. The order closes as Dispatched.
10. Stock shows 50 available and zero reserved.

Role navigation uses **My Work**, **Orders**, **Products**, **Inventory**, **Quality**, **Packing & Dispatch**, **Exceptions**, **Reports**, and **Administration**. There are no passwords in the reference pilot; choose the role on the sign-in screen.

Operational note: before presenting, confirm the n8n health check returns `ok: true`. The connected n8n account currently reports an execution quota limit; clear old executions or upgrade the plan before relying on live actions.

Useful prepared failures:

- `AGRA-DEMO-002`: 300 bags requested with only 220 released
- `AGRA-DEMO-003`: 30 bags in open rework
- `AGRA-DEMO-004`: ready for handover with a missing packing list

## Browser QA

Desktop and mobile checks cover login, every role menu, manager dashboard, order detail, multi-line order form, reports, mobile navigation, no horizontal overflow, image rendering, and browser console errors. Production smoke testing repeats login, health, refresh persistence, and a mobile viewport after deployment.

Accessibility smoke checks require labelled controls, named icon buttons, image alternative text, logical headings, visible focus styles, alert/status regions, and no duplicate element IDs.
