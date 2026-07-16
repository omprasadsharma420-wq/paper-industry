import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const schedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Agra - Exception Escalation Schedule',
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 2 }] } },
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
    name: 'Run OPEN_EXCEPTIONS Monitor',
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
      jsonBody: { p_kind: 'OPEN_EXCEPTIONS' },
      options: { timeout: 20000 },
    },
    position: [800, 300],
  },
});

export default workflow('agra-exception-escalation', 'Agra - Exception Escalation')
  .add(schedule)
  .to(signIn)
  .to(runMonitor);
