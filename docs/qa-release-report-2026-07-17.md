# Agra Operations Independent QA Release Report

> **Current redesign addendum, 17 July 2026:** The role-first redesign is implemented on branch `codex/role-first-operations-redesign` and passes TypeScript, ESLint, unit rules, role navigation, responsive overflow, logout, customer-reference search, and five role evidence captures. Deployment is intentionally held because the connected n8n account has reached its execution quota. n8n workflow inspection confirms the health and action workflows are active, but the latest execution error is `Execution limit reached`; the public health endpoint currently returns `Error in workflow` and action calls can return an empty HTTP 200 body. Clear n8n executions or upgrade the plan, then rerun `pnpm run verify:demo` and the dynamic Playwright flows before publishing this branch.

Date: 2026-07-17
QA branch: `codex/independent-qa-hardening`
Baseline production commit: `edf9e5f0975c3686a4963495d4415107f11015c6`
Supabase project: `etykyasaicfhrbbtbdfv`
n8n action workflow: `UZvuu1IPh20GjfHD`
Dataset: `2026-07-17.agra-pilot.v1` (`AGRA-DEMO`, isolated demo organization)

## Executive Summary

The finished-stock order, inventory, quality, packing, document, and dispatch demonstration is release-ready. The critical 200-diary browser journey completed through four operational roles and a fresh Manager session. UI requests, n8n executions, PostgreSQL state, reservations, audit rows, exceptions, refresh persistence, and reports agreed. Final state before the automatic reset was exactly 50 available diaries and zero reserved.

Recommendation: **CONDITIONALLY READY** for the Agra representative demonstration and finished-stock pilot. It is not a claim of full manufacturing ERP readiness: the lightweight made-to-order flow and a dedicated customer-history report remain partial scope.

## Architecture Verified

- Production and local builds use Supabase project `etykyasaicfhrbbtbdfv`; there is no local operational-data fallback.
- Demo role selection creates real Supabase Auth sessions through the origin-restricted `agra-demo-login` Edge Function. Roles are read from server-side profiles, not request bodies.
- Browser writes go to n8n workflow `UZvuu1IPh20GjfHD`, which validates the envelope and invokes the transactional `agra_execute_action` RPC.
- Inventory reservation, release, rework, and deduction run inside PostgreSQL transactions with row locks and request-ID idempotency.
- All 20 `agra_*` tables have RLS. Anonymous table access and ordinary authenticated table writes are blocked.
- Client bundles contain only the Supabase publishable key. No service-role key, database password, n8n token, or demo password is present in source or evidence.
- Cross-session consistency uses focus refresh plus 3-second polling. The measured requirement of eight seconds passed.
- Reset is manager-only, server-side, demo-organization scoped, transactional, audited, and restores the versioned reference dataset.

## Evidence Index

- Backend verification: `qa/artifacts/backend-verification-split-rework.log` (21 checks passed).
- Playwright JSON/HTML: `qa/artifacts/playwright-results.json`, `qa/artifacts/playwright-report/`.
- Full dispatch evidence: `qa/artifacts/full-dispatch/evidence.json` (11/11 request IDs correlated to n8n).
- Critical screenshots: `qa/artifacts/screenshots/01-order-created.png` through `06-manager-persistence.png`.
- Failure traces retained during defect discovery: `qa/artifacts/playwright-results/`.
- Baseline exports: `qa/artifacts/baseline/` (workspace, health, workflow definitions, execution metadata; secret scan clear).

## Test Matrix

| Test ID | Scenario | Result | UI evidence | Database evidence | n8n evidence | Defect ID |
| --- | --- | --- | --- | --- | --- | --- |
| ARC-01 | Intended Supabase project and deployment environment | PASS | System view | Baseline metadata | Health workflow | - |
| ARC-02 | Real Auth session and server-derived role | PASS | Five role logins | Profile/RPC assertions | Gateway bearer validation | - |
| ARC-03 | Request-body `MANAGER_ADMIN` spoof | PASS | Hidden unauthorized actions | `FORBIDDEN`, failed audit | Gateway execution | - |
| ARC-04 | Transactional reservations and deductions | PASS | Approval/handover states | 200 reserved, then deducted; no negative row | E753, E760 | - |
| ARC-05 | RLS, anonymous access, direct writes, audit tampering | PASS | N/A | All attacks rejected | N/A | - |
| ARC-06 | No secrets or fallback data | PASS | Honest outage state | Source/bundle/evidence scans clear | N/A | - |
| ROLE-01 | Sales navigation, queue, and backend limits | PASS | Playwright role test | Denied approve/reset/stock release audited | Gateway | - |
| ROLE-02 | Stock & Quality navigation, queue, and backend limits | PASS | Playwright role test | Handover denied | Gateway | - |
| ROLE-03 | Packing navigation, queue, and backend limits | PASS | Playwright role test | Approval denied | Gateway | - |
| ROLE-04 | Supervisor navigation, queue, and backend limits | PASS | Playwright role test | Direct inventory write denied | N/A | - |
| ROLE-05 | Manager navigation and system controls | PASS | Playwright role test | Manager RPCs authorized | Gateway | - |
| FLOW-01 | Create `KEG-QA-200-DIARY-001` draft | PASS | Screenshot 01 | Draft/order item/document rows | E750 | - |
| FLOW-02 | Submit and affected-role update | PASS | Cross-session trace | Status/audit persisted | E751 | QA-001 |
| FLOW-03 | Stock check | PASS | Quality session | Awaiting approval | E752 | - |
| FLOW-04 | Approve 200 diaries | PASS | Screenshot 02 | 200 reserved, 50 available | E753 | - |
| FLOW-05 | Start and complete picking | PASS | Packing session | Pick and reservation rows agree | E754-E755 | - |
| FLOW-06 | Seven-item diary QC pass | PASS | Screenshot 03 | Checklist JSON and QC row | E756 | QA-003 |
| FLOW-07 | Pack 10 cartons x 20 | PASS | Packing form | 200 packing items, 10 cartons | E757 | - |
| FLOW-08 | Missing documents block handover | PASS | Screenshot 04 | BLOCKED + open exception + failed audit | E758 | QA-004 |
| FLOW-09 | Documents restore ready state | PASS | Document form | Three required docs verified; exception resolved | E759 | QA-004 |
| FLOW-10 | Nepal Demo Logistics handover | PASS | Screenshot 05 | Courier/tracking persisted; stock deducted | E760 | QA-005 |
| FLOW-11 | Fresh Manager session and refresh persistence | PASS | Screenshot 06 | DISPATCHED, CLOSED, 50 available, 0 reserved | E760 | - |
| SYNC-01 | Affected role sees submission within 8 seconds | PASS | Cross-session trace | Fresh workspace state | Correlated execution | QA-001 |
| DATA-01 | Two-SKU 100-diary/50-bag order | PASS | API-driven UI state | Per-SKU reserve/pick/QC/pack/cancel reconciled | Gateway | - |
| DATA-02 | 300 bags against 220 available | PASS | Blocked status | No reservation; shortage exception/audit | Gateway | - |
| DATA-03 | Zero and negative quantities | PASS | Browser input minimum | Server rejects; no order rows | Gateway | - |
| DATA-04 | Duplicate reference, same customer | PASS | Clear error path | Unique constraint; failed audit | Gateway | - |
| DATA-05 | Same reference, different customer | PASS | N/A | Allowed by scoped unique index | Gateway | - |
| DATA-06 | 200/100 concurrent diary approvals | PASS | N/A | Exactly one winner; total never above 250 | Gateway | - |
| DATA-07 | Cancellation releases all reservations | PASS | Cancel control | 250 available restored; reason/audit persist | Gateway | - |
| DATA-08 | Duplicate approval request ID | PASS | N/A | Same response; one reservation | Gateway | - |
| QC-01 | Failed QC isolates affected quantity | PASS | Quality workflow | Rework stock excluded from available | Gateway | - |
| QC-02 | Split rework: 45 corrected, 5 damaged | PASS | Browser rework form | 245 released, 195 reserved, 5 damaged, 50 available | Gateway | QA-007 |
| QC-03 | Incomplete diary checklist cannot pass | PASS | Seven checkboxes | Trigger rejects, state unchanged, failed audit | Gateway | QA-003 |
| DEL-01 | Third-party courier fields and successful dispatch | PASS | Conditional form | Courier guard and handover row | E760 | QA-005 |
| DEL-02 | Customer pickup required fields | PASS | Conditional form | Backend guard; successful regression flow | Gateway | - |
| DEL-03 | Company vehicle required fields and canonical code | PASS | Conditional form | Backend guard accepts configured enum | Gateway | QA-006 |
| FIND-01 | Search order number/customer/reference/SKU | PASS | Playwright search | Same workspace rows | N/A | QA-002 |
| FIND-02 | Combined status/customer/date/SKU/priority/team filters | PASS | Playwright filter test | Target record agreement | N/A | - |
| FIND-03 | Stable sort and clear filters | PASS | Playwright filter test | Five baseline orders restored | N/A | - |
| NAV-01 | Direct order links, refresh, back/forward | PASS | Playwright navigation test | Authorized record only | N/A | - |
| NAV-02 | Invalid record ID does not show stale order | PASS | Empty order state | No unintended record | N/A | - |
| NAV-03 | Unauthorized deep link falls back to role home | PASS | Sales/system test | Server role unchanged | N/A | - |
| NAV-04 | Passwordless logout and return | PASS | Playwright logout test | Session removed | N/A | - |
| UI-01 | Desktop/tablet/mobile overflow | PASS | 1440/1024/390 viewports | N/A | N/A | - |
| UI-02 | Form/modal accessibility, visible errors, success status | PASS | Browser traces | Failure/success responses agree | Gateway | - |
| TZ-01 | Nepal display timezone and report “today” | PASS | `Asia/Kathmandu` rendering | Timestamps remain `timestamptz` | N/A | - |
| FAIL-01 | n8n unavailable | PASS | Honest request failure | No mutation | Unavailable endpoint | - |
| FAIL-02 | Supabase unavailable/fallback behavior | PASS | Workspace error state | No local fallback | N/A | - |
| RESET-01 | Manager reset and fresh-session baseline | PASS | Confirmed reset path | Five orders, five users, stock and docs restored | Gateway | - |
| RESET-02 | Non-manager reset | PASS | Action unavailable | `FORBIDDEN` and failed audit | Gateway | - |
| SCOPE-01 | Made-to-order/custom production lifecycle | PARTIAL | Fields and production update exist | No dedicated produced-batch-to-QC transaction | Gateway action exists | LIM-001 |
| SCOPE-02 | Dedicated customer order history/activity view | NOT IMPLEMENTED | Customer master only | Data exists in orders/read model | N/A | LIM-003 |

## Defects Fixed

| Defect | Severity | Root cause | Fix | Retest |
| --- | --- | --- | --- | --- |
| QA-001 | High | 30-second polling left affected roles stale | Poll every 3 seconds and on focus | PASS within 8 seconds |
| QA-002 | Medium | Search omitted customer reference, SKU, and product name | Expanded indexed in-memory search fields | PASS |
| QA-003 | High | Diary pass had no visible or server-required checklist | Seven UI checks plus PostgreSQL guard trigger | PASS incomplete/complete paths |
| QA-004 | High | Missing-doc exception did not block order or auto-resolve | Exception/document triggers and repair UI access | PASS |
| QA-005 | High | Courier handover inherited pickup-only `receiver_name` constraint | Method guard plus nullable pickup-only column | PASS full courier dispatch |
| QA-006 | High | UI used `OWN_VEHICLE`; schema required `COMPANY_VEHICLE` | Canonical enum alignment across UI/guard/tests | PASS |
| QA-007 | High | Rework completion allowed only one outcome for all units | Idempotent split completion wrapper with inventory/audit reconciliation | PASS 45/5 split |
| QA-008 | Low | ESLint scanned generated Playwright report assets | Added `qa/artifacts/**` global ignore | PASS lint |

## Remaining Limitations

- `LIM-001`: Made-to-order fields and production progress are present, but production output is not yet created as a new inventory batch and routed through the full QC lifecycle. Do not demonstrate this as complete.
- `LIM-002`: Cross-session updates use 3-second polling rather than Supabase Realtime. The operational freshness target passes, but this is not push-based synchronization.
- `LIM-003`: Customer records do not yet have a dedicated order-history/activity screen, although orders are filterable by customer and the read model contains the relationships.
- Supabase advisors report intentional security-definer warnings for authenticated, role-checking RPC boundaries and a project-level leaked-password-protection warning. Unused-index notices are informational for the small demo dataset. See [Supabase database linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Demonstration Sequence

1. Open the public URL and choose **Sales**.
2. Open **Orders**, create a 200-piece diary order for Kathmandu Eco Gifts, and submit it.
3. Choose **Stock & Quality**, open the order, and run **Check stock**.
4. Choose **Supervisor**, approve the order, and point out 200 reserved / 50 available.
5. Choose **Packing**, start and finish picking.
6. Choose **Stock & Quality**, complete all seven diary checks and save the pass.
7. Choose **Packing**, record 10 cartons with 20 diaries each.
8. Attempt handover before documents to show the named block; then verify invoice, packing list, and dispatch note.
9. Confirm third-party courier handover with Nepal Demo Logistics and `NDL-KEG-001`.
10. Choose **Manager**, refresh, and show Dispatched plus 50 available / 0 reserved in Stock and Reports.
11. Use **System > Reset demo** after the presentation.

## Rollback

1. Redeploy the prior Sites version recorded immediately before this release.
2. Revert the release commit on a new branch and deploy that exact pushed commit.
3. Database changes are additive guards/contracts. If rollback is required, disable the newest triggers/functions only after stopping writes; then restore the prior `agra_execute_action_core` function name and grants in a reviewed migration.
4. Run `pnpm verify:demo` after rollback and confirm the reference reset before reopening the demo.

The final release commit, Sites version, production URL, and deployment result are recorded in the release handoff accompanying this report.
