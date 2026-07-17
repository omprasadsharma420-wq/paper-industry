# Agra Operations product and UX redesign

Date: 17 July 2026  
Baseline release: Sites version 11, Git commit `d1742f5fa2f906193f69ea69dbb5f2870c60cdaa`  
Working branch: `codex/role-first-operations-redesign`

## Design direction

Agra Operations should feel like a quiet manufacturing work system, not a generic dashboard. Frontline users start with a short role queue and one clear next action. Managers start with risks and flow performance. Readable product and variant names lead; internal codes remain available as secondary identifiers.

The visual system uses neutral surfaces, one Agra green accent, compact but legible typography, 6-8 px radii, explicit status text, 44 px operational tap targets, visible keyboard focus, and minimal motion.

## Existing experience audit

### Navigation and role differentiation

- Role-specific navigation exists, but every role still lands on the same structural homepage.
- Every homepage repeats organization-wide order, issue, handover, stock, and n8n information.
- Manager navigation omits Products but exposes frontline Stock, Quality, and Packing actions.
- Manager can see New order, Receive batch, Finish rework, and normal order actions in primary UI.
- `Home`, `Stock`, `Issues`, and `Pack & send` are broad labels that do not consistently describe the user's task.

### Dashboard density and information hierarchy

- Four generic metrics, a queue, Stock watch, and Recent automation compete on every role homepage.
- Technical automation history is primary content for frontline staff.
- Packing and Sales see operational metrics outside their responsibility.
- The manager view mixes demo guidance, frontline work, stock monitoring, and integration events.
- Empty and clear queues do not use the freed space to explain the role's next likely handoff.

### Orders and handoffs

- Eight search, filter, and sort controls appear at once before the order list.
- Order details are compressed into a 430 px side panel even when the order is the main object.
- Owner and next action are present, but due state, time in stage, blocker, and next role are not grouped above the fold.
- Workflow actions appear at the bottom of a long detail panel and management sees frontline controls.
- The progress indicator shows stages but not actor, timestamp, handoff, or important notes.
- The same order row prioritizes order number and status but does not state the required action.

### Products, SKUs, and inventory

- SKU code is often the first product identifier, requiring users to decode it.
- Product family and variant are not visually separated even though the database already stores size, colour, design, pages, material, and unit.
- Product cards repeat pricing-not-configured content that does not help current operations.
- Inventory uses a wide nine-column table and omits pending, rework, blocked, and damaged quantities from the main batch comparison.
- Product detail, quality context, related orders, and activity do not have a consistent drill-down model.

### Forms and error prevention

- New order is one large modal with customer, delivery, line items, custom details, and six flags visible together.
- Product choices lead with codes and do not show variant or available stock.
- QC and packing are generic two-column forms rather than task-specific guided flows.
- Required fields are marked, but inline review, remaining stock, reconciliation, and handoff confirmation are weak.
- Error messages are global; field-level guidance and an error summary are limited.
- Unsaved complex-form navigation is not guarded.

### Mobile, accessibility, and reliability

- Responsive hiding reduces some row context, making mobile tasks less informative rather than more focused.
- Several operational buttons are 36-40 px high rather than a consistent 44 px target.
- Status is generally text plus colour, which is good, but ageing states are absent.
- Loading uses a spinner rather than a layout-matched skeleton.
- Polling keeps cross-session data fresh, but connection loss and reconnecting state are not visible.
- User-facing labels are distributed through a 1,126-line component, limiting language readiness and consistency.

### Management usefulness

- Reports include useful operational totals but lack a focused bottleneck and workload summary.
- Raw recent action history appears beside management metrics instead of on a separate audit surface.
- No role workload or ageing categories are visible.
- Technical health is correctly restricted to management, but it is duplicated as frontline automation content on Home.

## Revised information architecture

| Module | Purpose | Default audience |
| --- | --- | --- |
| My Work | Role queue, due today, overdue, blocked, completed recently | All roles |
| Orders | Searchable commercial order register and full order workspace | Sales, Supervisor, Manager; read-only context for operational roles |
| Customers | Customer records and order history | Sales |
| Products | Product families, readable variants, SKU and stock summary | Sales read-only, Inventory, Manager |
| Inventory | Batch quantities, locations, release condition and stock states | Inventory, Packing read-only, Manager read-only |
| Quality | QC queue, product checklist, rework and damaged stock | Inventory |
| Packing & Dispatch | Picking, packing, documents and handover queue | Packing |
| Exceptions | Assigned operational exceptions and resolution | Supervisor, Manager read-only |
| Reports | Flow, bottlenecks, SKU attention and workload | Manager |
| Administration | Team access, system health, demo reset and reference configuration | Manager |

Regular work is reachable from My Work in one click and from any other module within three clicks.

## Role-permission matrix

| Capability | Sales | Inventory & Quality | Packing & Dispatch | Supervisor | Manager |
| --- | :---: | :---: | :---: | :---: | :---: |
| Create customer/order | Act | - | - | - | View |
| Edit/submit draft | Act | - | - | View | View |
| Check stock/select eligible batch | View availability | Act | View reserved | View | View |
| Record QC/rework/damage | - | Act | View result | View | View |
| Approve/reject/cancel/resolve | - | - | - | Act | View/audit |
| Pick/pack/documents/handover | - | - | Act | Coordinate | View |
| Reports/audit/system | - | - | - | Operational exceptions | Act |

Frontend visibility supports comprehension only. Supabase and the n8n action gateway remain the authorization authority.

## Role-specific screen map

### Sales

- My Work: drafts, corrections, missing customer information, due soon, recently submitted
- Orders: commercial register, customer reference search, create/edit flow
- Customers: customer details and order history
- Products: readable catalogue and simple availability language

### Inventory and Quality

- My Work: stock checks, QC, rework, blocked batches, QC due today
- Inventory: batch compartments and locations
- Quality: checklist and reinspection flows
- Products: variant, release state and quality configuration context
- Orders: read-only order context with authorized task action

### Packing and Dispatch

- My Work: picking, packing, missing documents, handover
- Packing & Dispatch: stage-specific queue and print views
- Orders: read-only commercial and fulfilment context with authorized task action
- Inventory: released/reserved availability only

### Supervisor

- My Work: approvals, blocked/overdue orders, conflicts and exceptions
- Orders: full operational timeline and controlled supervisor actions
- Exceptions: assigned, overdue and resolved views

### Manager

- My Work: management overview, bottlenecks and risk
- Orders, Products, Inventory: read-only organization view
- Reports: flow, SKU attention, quality and workload
- Administration: team, audit, connectivity, demo reset

## SKU information model

The existing database fields are sufficient for Phase 1 and remain authoritative.

| Layer | Fields |
| --- | --- |
| Product family | Category and normalized family name |
| Variant identity | Size, colour/finish, design, page count and custom/standard |
| Operational identity | SKU, unit, standard pack, active state |
| Stock state | Released, reserved, available, pending QC, rework, blocked, damaged |
| Quality and location | Batch QC state, storage location, shelf and latest release condition |

Display order: family name, variant summary, SKU code. Existing SKU values remain unchanged to preserve integrations and test fixtures.

## Derived work-task model

No duplicate task table is introduced. Tasks are derived from authoritative order status, exceptions, rework records, profiles, due dates, and audit transitions.

Each task exposes: type, title, order, assigned role, demo assignee, priority, due date, created/stage time, age, status, blocker, current owner, next role and one next action.

Demonstration ageing thresholds are stored in application configuration and labelled for company validation. They are not represented as Agra policy.

## Research decisions

- Use a worklist for predefined items to process and a separate list report for broad record search, following [SAP Fiori Worklist guidance](https://experience.sap.com/fiori-design-web/worklist-sap-fiori-elements/).
- Use full object pages and guided steps for complex, cross-team objects, following [SAP Fiori object handling guidance](https://experience.sap.com/fiori-design-web/manage-objects/).
- Keep worker menus and field priority role-specific, consistent with [Microsoft Warehouse Management mobile role and field configuration](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/configure-app-field-names-priorities-warehouse).
- Attach quality work to a product/batch and the originating operation, consistent with [Odoo quality-check guidance](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/quality/quality_management/quality_checks.html).
- Retain batch/lot traceability from product through shipment, consistent with [Odoo product tracking guidance](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/product_tracking.html).
- Use explicit short task names and text statuses, informed by the [GOV.UK task-list pattern](https://design-system.service.gov.uk/components/task-list/).
- Show form errors in context and in a focused summary, informed by the [GOV.UK error-summary pattern](https://design-system.service.gov.uk/components/error-summary/).
- Maintain at least 24 px pointer targets with 44 px operational controls, exceeding the [WCAG 2.2 target-size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## Before evidence

Baseline screenshots are stored in `docs/evidence/before/` for all five role homepages and the principal order, product, inventory, quality, packing, exception, report, team, system, form, and mobile views.

## Scope guardrails

- No accounting, production planning, donor management, or impact module is added.
- No new company SLA, override, pricing, or approval policy is asserted.
- Broom operations and community programmes remain roadmap items.
- The reference-pilot disclaimer remains visible and uses the company-approved preliminary-information wording.

## Implementation status

Implemented on `codex/role-first-operations-redesign`:

- Role-first My Work queues for Sales, Inventory & Quality, Packing & Dispatch, Supervisor, and Manager.
- Readable product family and variant display with SKU as the secondary identifier.
- Full order workspace with ageing, owner, next action, blocker, handoff, documents, timeline, exceptions, and print view.
- Product, inventory, quality, packing, exception, report, and administration work areas with role-appropriate controls.
- Guided new-order, product, receiving, QC, rework, production, and packing forms with step validation and unsaved-change protection.
- Responsive mobile navigation and 44 px operational targets.

Local verification completed: TypeScript, ESLint, unit rules, role navigation, responsive overflow, logout, order search, and role evidence screenshots. Full dynamic action verification is currently waiting on the connected n8n account: its execution quota has been reached, so both live webhooks return an execution-limit error until the quota is cleared or the plan is upgraded.
