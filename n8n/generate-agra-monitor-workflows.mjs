import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const workflows = [
  {
    id: 'agra-low-stock-check',
    file: 'agra-low-stock-check.mjs',
    name: 'Agra - Low Stock Check',
    kind: 'LOW_STOCK',
    interval: `{ field: 'hours', hoursInterval: 4 }`,
  },
  {
    id: 'agra-rework-reminder',
    file: 'agra-rework-reminder.mjs',
    name: 'Agra - Rework Reminder',
    kind: 'OPEN_REWORK',
    interval: `{ field: 'days', daysInterval: 1, triggerAtHour: 9, triggerAtMinute: 0 }`,
  },
  {
    id: 'agra-exception-escalation',
    file: 'agra-exception-escalation.mjs',
    name: 'Agra - Exception Escalation',
    kind: 'OPEN_EXCEPTIONS',
    interval: `{ field: 'hours', hoursInterval: 2 }`,
  },
  {
    id: 'agra-daily-operations-report',
    file: 'agra-daily-operations-report.mjs',
    name: 'Agra - Daily Operations Report',
    kind: 'DAILY_SUMMARY',
    interval: `{ field: 'days', daysInterval: 1, triggerAtHour: 17, triggerAtMinute: 0 }`,
  },
];

const outputDirectory = path.resolve('n8n', 'workflows');
await mkdir(outputDirectory, { recursive: true });

for (const definition of workflows) {
  const source = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const schedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: '${definition.name} Schedule',
    parameters: { rule: { interval: [${definition.interval}] } },
    position: [240, 300],
  },
});

const signIn = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Open Automation Session',
    parameters: {
      method: 'POST',
      url: 'https://etykyasaicfhrbbtbdfv.supabase.co/auth/v1/token',
      authentication: 'none',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'grant_type', value: 'password' }] },
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: 'sb_publishable_9CUzPDO-Ep08eZUihvGuYA_0smOgJA5' },
        { name: 'Content-Type', value: 'application/json' },
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: { email: 'manager@agra-demo.example', password: '__AGRA_MANAGER_PASSWORD__' },
      options: { timeout: 10000 },
    },
    position: [520, 300],
  },
});

const runMonitor = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Run ${definition.kind} Monitor',
    parameters: {
      method: 'POST',
      url: 'https://etykyasaicfhrbbtbdfv.supabase.co/rest/v1/rpc/agra_run_monitor',
      authentication: 'none',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: 'sb_publishable_9CUzPDO-Ep08eZUihvGuYA_0smOgJA5' },
        { name: 'Authorization', value: expr('{{ "Bearer " + $json.access_token }}') },
        { name: 'Content-Type', value: 'application/json' },
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: { p_kind: '${definition.kind}' },
      options: { timeout: 20000 },
    },
    position: [800, 300],
  },
});

export default workflow('${definition.id}', '${definition.name}')
  .add(schedule)
  .to(signIn)
  .to(runMonitor);
`;

  await writeFile(path.join(outputDirectory, definition.file), source, 'utf8');
}

console.log(`Generated ${workflows.length} monitor workflows.`);
