import { workflow, node, trigger } from '@n8n/workflow-sdk';

const healthWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Health Check',
    parameters: {
      httpMethod: 'GET',
      path: 'agra-operations-health',
      authentication: 'none',
      responseMode: 'lastNode',
      responseData: 'firstEntryJson',
      options: { allowedOrigins: '*' },
    },
    position: [240, 300],
  },
});

const buildHealthResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Health Response',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `return [{ json: {
  ok: true,
  service: 'Agra Operations Orchestrator',
  status: 'CONNECTED',
  policyVersion: '2026-07-17.agra-operations.v1',
  environment: 'DEMO',
  databaseAuthority: 'Supabase',
  checkedAt: new Date().toISOString()
} }];`,
    },
    position: [520, 300],
  },
});

export default workflow('agra-operations-health', 'Agra - Operations Health')
  .add(healthWebhook)
  .to(buildHealthResponse);
