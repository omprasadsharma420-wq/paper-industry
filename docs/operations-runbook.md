# Operations Runbook

## Service Map

- Public site: `https://paper-industry-dispatch-control.trafangularlaw01.chatgpt.site`
- Supabase project: `etykyasaicfhrbbtbdfv`
- n8n workspace: `https://om420.app.n8n.cloud`
- Action webhook: `https://om420.app.n8n.cloud/webhook/agra-operations-action`
- Health webhook: `https://om420.app.n8n.cloud/webhook/agra-operations-health`
- Sites project: `appgprj_6a5763c66bd48191947142784450ab36`

## Health

Managers open **System** and run the live check. Healthy values are:

- Supabase connected
- n8n connected
- Inventory errors: `0`
- Reservation errors: `0`
- Active users: `5`
- Environment: `DEMO`

The public n8n health endpoint must return `ok: true` and `databaseAuthority: Supabase`.

## Reset

Only the Manager role can reset the reference dataset.

1. Sign in as Manager.
2. Open **System**.
3. Select **Reset demo**.
4. Confirm the dialog.
5. Verify five orders and 250 available diaries.

Reset deletes and recreates only the isolated demo organization's operational records. Authentication users and profiles remain intact.

## Deployment

1. Run unit, lint, TypeScript, build, and live verification.
2. Build the Sites artifact with `pnpm build`.
3. Save and deploy a new version to the existing Sites project.
4. Poll deployment status until ready.
5. Run production desktop and mobile smoke tests.
6. Reset the presentation dataset one final time.

## Rollback

Prebuild tag: `pre-agra-pilot-20260717`

Prebuild Sites version: `7`

Backup directory: `backups/pre-agra-pilot-20260717/`

Rollback sequence:

1. Redeploy Sites version 7.
2. Republish the legacy n8n workflow `p5mg9pe8UByKz6Kp` if the old UI needs it.
3. Restore the legacy RPC grants below if the old UI needs them.
4. Keep the additive Agra tables in place; they do not overwrite legacy dispatch tables.
5. Use the tag and backup manifest to reproduce the prebuild application and data state.

Legacy grant restoration:

```sql
grant execute on function public.demo_load_state() to anon, authenticated;
grant execute on function public.demo_reset_state() to anon, authenticated;
grant execute on function public.demo_create_dispatch(
  text, public.app_role, text, public.customer_type, text,
  public.dispatch_priority, text, numeric, date
) to anon, authenticated;
grant execute on function public.demo_apply_workflow_action(
  uuid, text, public.app_role, text, jsonb, jsonb
) to anon, authenticated;
```

## Pilot Limitations

- Demo users share a presentation password; production requires individual users, password policy, recovery, and session governance.
- Scheduled n8n monitors currently use a limited demo Manager account. Production should use a dedicated automation identity and protected n8n credential.
- Document references are tracked, but file upload and storage are not included.
- Pricing, revenue, cost, tax, accounting, and payment controls are intentionally not configured.
- Production planning is represented by a controlled completion update, not a full manufacturing module.
- Broom operations, community-program tracking, circular traceability, and impact reporting remain future modules.
